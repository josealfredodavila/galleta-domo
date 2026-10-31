package com.sariels.app

import android.app.Activity
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Bundle
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.sariels.app.databinding.ActivityStreamBinding
import io.github.jan.supabase.gotrue.auth
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.rpc
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

class StreamActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_JUEGO_NOMBRE = "juego_nombre"
        const val EXTRA_JUEGO_PACKAGE = "juego_package"
        const val EXTRA_JUEGO_ID = "juego_id"
    }

    private lateinit var binding: ActivityStreamBinding
    private var juegoNombre = ""
    private var juegoPackage = ""
    private var juegoId = ""
    private var transmisionId: Long? = null
    private var finalizando = false

    private val screenCaptureLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val data = result.data
        if (result.resultCode == Activity.RESULT_OK && data != null) {
            iniciarTransmision(result.resultCode, data)
        } else {
            Toast.makeText(this, "Permiso de captura de pantalla denegado", Toast.LENGTH_LONG).show()
            finish()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityStreamBinding.inflate(layoutInflater)
        setContentView(binding.root)

        juegoNombre = intent.getStringExtra(EXTRA_JUEGO_NOMBRE) ?: "Juego"
        juegoPackage = intent.getStringExtra(EXTRA_JUEGO_PACKAGE) ?: ""
        juegoId = intent.getStringExtra(EXTRA_JUEGO_ID) ?: ""

        binding.tvTitulo.text = "Preparando $juegoNombre"
        binding.tvEstado.text = "PREPARANDO TRANSMISIÓN"
        binding.btnFinalizar.setOnClickListener { finalizarTransmision() }

        lifecycleScope.launch {
            val pase = verificarLivePass()
            if (!pase) {
                Toast.makeText(this@StreamActivity, "Necesitas un Live Pass activo para transmitir.", Toast.LENGTH_LONG).show()
                finish()
                return@launch
            }
            solicitarCapturaPantalla()
        }
    }

    /** Consulta la misma validación que usa la web antes de pedir permisos de captura. */
    private suspend fun verificarLivePass(): Boolean = withContext(Dispatchers.IO) {
        try {
            val session = SupabaseProvider.client.auth.currentSessionOrNull() ?: return@withContext false
            val resultado = SupabaseProvider.client.postgrest.rpc(
                "puede_transmitir_live",
                buildJsonObject { put("p_usuario_id", JsonPrimitive(session.user!!.id)) }
            ).decodeAs<Map<String, kotlinx.serialization.json.JsonElement>>()
            val puede = resultado["puede"]
            puede != null && puede.toString() == "true"
        } catch (e: Exception) {
            false
        }
    }

    private fun solicitarCapturaPantalla() {
        val manager = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        screenCaptureLauncher.launch(manager.createScreenCaptureIntent())
    }

    private fun iniciarTransmision(resultCode: Int, data: Intent) {
        lifecycleScope.launch {
            try {
                binding.tvEstado.text = "CREANDO TRANSMISIÓN…"

                // 1. Crear la transmisión en el servidor (la base decide la sala y valida Live Pass)
                val id = withContext(Dispatchers.IO) {
                    SupabaseProvider.client.postgrest.rpc(
                        "crear_transmision",
                        buildJsonObject {
                            put("p_titulo", JsonPrimitive("Jugando $juegoNombre"))
                            put("p_categoria", JsonPrimitive("gaming"))
                            put("p_room_name", kotlinx.serialization.json.JsonNull)
                            put("p_grupo_id", kotlinx.serialization.json.JsonNull)
                            put("p_precio_acceso", JsonPrimitive(0))
                        }
                    ).decodeAs<Long>()
                }
                transmisionId = id

                // 2. Pedir al servidor el token; el servidor decide sala y permisos
                val token = LiveKitManager.obtenerToken(streamId = id.toInt(), rol = "streamer")

                // 3. Arrancar el servicio de captura con la URL y el token del servidor
                val serviceIntent = Intent(this@StreamActivity, ScreenCaptureService::class.java).apply {
                    putExtra(ScreenCaptureService.EXTRA_RESULT_CODE, resultCode)
                    putExtra(ScreenCaptureService.EXTRA_DATA, data)
                    putExtra(ScreenCaptureService.EXTRA_LIVEKIT_URL, token.url ?: LiveKitManager.LIVEKIT_URL)
                    putExtra(ScreenCaptureService.EXTRA_TOKEN, token.token)
                    putExtra(ScreenCaptureService.EXTRA_TRANSMISION_ID, id)
                    putExtra(ScreenCaptureService.EXTRA_JUEGO_NOMBRE, juegoNombre)
                    putExtra(ScreenCaptureService.EXTRA_JUEGO_PACKAGE, juegoPackage)
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(serviceIntent)
                else startService(serviceIntent)

                binding.tvTitulo.text = "Transmitiendo $juegoNombre"
                binding.tvEstado.text = "EN VIVO"
                abrirJuego()
            } catch (e: Exception) {
                binding.tvEstado.text = "ERROR"
                Toast.makeText(this@StreamActivity, "Error al iniciar: ${e.message}", Toast.LENGTH_LONG).show()
                transmisionId?.let { cerrarEnServidor(it) }
                transmisionId = null
            }
        }
    }

    private fun abrirJuego() {
        if (juegoPackage.isBlank()) return
        val launch = packageManager.getLaunchIntentForPackage(juegoPackage)
        if (launch != null) {
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            startActivity(launch)
        } else {
            Toast.makeText(this, "El juego no está instalado.", Toast.LENGTH_LONG).show()
        }
    }

    private fun finalizarTransmision() {
        if (finalizando) return
        finalizando = true
        lifecycleScope.launch {
            try {
                binding.tvEstado.text = "FINALIZANDO…"
                transmisionId?.let { cerrarEnServidor(it) }
                transmisionId = null
                stopService(Intent(this@StreamActivity, ScreenCaptureService::class.java))
                Toast.makeText(this@StreamActivity, "Transmisión finalizada", Toast.LENGTH_SHORT).show()
                finish()
            } catch (e: Exception) {
                finalizando = false
                Toast.makeText(this@StreamActivity, "No se pudo cerrar en el servidor. Intenta de nuevo.", Toast.LENGTH_LONG).show()
            }
        }
    }

    /** Cierre oficial: la RPC libera el Live Pass y los contadores. No se actualiza la tabla a mano. */
    private suspend fun cerrarEnServidor(id: Long) {
        withContext(Dispatchers.IO) {
            SupabaseProvider.client.postgrest.rpc(
                "finalizar_transmision",
                buildJsonObject { put("p_transmision_id", JsonPrimitive(id)) }
            )
        }
    }
}