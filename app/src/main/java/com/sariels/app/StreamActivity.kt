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
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.time.Instant

class StreamActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_JUEGO_NOMBRE = "juego_nombre"
        const val EXTRA_JUEGO_PACKAGE = "juego_package"
        const val EXTRA_JUEGO_ID = "juego_id"
        const val EXTRA_TRANSMISION_ID = "transmision_id"
        const val EXTRA_ROOM_NAME = "room_name"
        const val EXTRA_TOKEN = "token"
    }

    private lateinit var binding: ActivityStreamBinding
    private var juegoNombre: String = ""
    private var juegoPackage: String = ""
    private var juegoId: String = ""
    private var transmisionId: String? = null
    private var roomName: String? = null
    private var liveKitToken: String? = null
    private var transmisionIniciada = false
    private var finalizando = false

    private val screenCaptureLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK && result.data != null) {
            iniciarTransmisionReal(result.resultCode, result.data!!)
        } else {
            Toast.makeText(this, "❌ Permiso de captura de pantalla denegado", Toast.LENGTH_LONG).show()
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

        binding.tvTitulo.text = "🎮 Preparando $juegoNombre"
        binding.tvEstado.text = "🟡 PREPARANDO TRANSMISIÓN"
        binding.btnFinalizar.setOnClickListener { finalizarTransmision() }

        solicitarCapturaPantalla()
    }

    private fun solicitarCapturaPantalla() {
        val projectionManager = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        val captureIntent = projectionManager.createScreenCaptureIntent()
        screenCaptureLauncher.launch(captureIntent)
    }

    private fun iniciarTransmisionReal(resultCode: Int, data: Intent) {
        lifecycleScope.launch {
            try {
                binding.tvEstado.text = "🟡 CREANDO TRANSMISIÓN..."

                val session = withContext(Dispatchers.IO) {
                    SupabaseClient.client.auth.currentSessionOrNull()
                }

                if (session == null) {
                    Toast.makeText(this@StreamActivity, "⚠️ Debes iniciar sesión para transmitir.", Toast.LENGTH_LONG).show()
                    finish()
                    return@launch
                }

                val userId = session.user.id
                val generatedRoomName = "live-$userId-${System.currentTimeMillis()}"
                val titulo = "🎮 Jugando $juegoNombre"

                val transmision = withContext(Dispatchers.IO) {
                    SupabaseClient.client
                        .from("transmisiones")
                        .insert(
                            TransmisionInsert(
                                streamerId = userId,
                                roomName = generatedRoomName,
                                titulo = titulo,
                                categoria = "gaming",
                                descripcion = "Transmitiendo $juegoNombre",
                                tipoTransmision = "gratis",
                                precio = 0.0,
                                estado = "en_vivo",
                                fechaInicio = Instant.now().toString()
                            )
                        ) { select() }
                        .decodeSingle<TransmisionCreada>()
                }

                transmisionId = transmision.id
                roomName = transmision.roomName

                val token = withContext(Dispatchers.IO) {
                    LiveKitManager.obtenerToken(roomName = transmision.roomName, identity = userId)
                }
                liveKitToken = token

                val serviceIntent = Intent(this@StreamActivity, ScreenCaptureService::class.java).apply {
                    putExtra(ScreenCaptureService.EXTRA_RESULT_CODE, resultCode)
                    putExtra(ScreenCaptureService.EXTRA_DATA, data)
                    putExtra(ScreenCaptureService.EXTRA_ROOM_NAME, transmision.roomName)
                    putExtra(ScreenCaptureService.EXTRA_TOKEN, token)
                    putExtra(ScreenCaptureService.EXTRA_TRANSMISION_ID, transmision.id)
                    putExtra(ScreenCaptureService.EXTRA_JUEGO_NOMBRE, juegoNombre)
                    putExtra(ScreenCaptureService.EXTRA_JUEGO_PACKAGE, juegoPackage)
                }

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    startForegroundService(serviceIntent)
                } else {
                    startService(serviceIntent)
                }

                transmisionIniciada = true
                binding.tvTitulo.text = "🎮 Transmitiendo $juegoNombre"
                binding.tvEstado.text = "🔴 EN VIVO"
                Toast.makeText(this@StreamActivity, "✅ Transmisión iniciada", Toast.LENGTH_SHORT).show()

                abrirJuego()

            } catch (e: Exception) {
                binding.tvEstado.text = "❌ ERROR"
                Toast.makeText(this@StreamActivity, "❌ Error al iniciar: ${e.message}", Toast.LENGTH_LONG).show()
                e.printStackTrace()
                transmisionId?.let { id -> finalizarTransmisionEnSupabase(id) }
            }
        }
    }

    private fun abrirJuego() {
        if (juegoPackage.isBlank()) {
            Toast.makeText(this, "⚠️ El juego no tiene package_name.", Toast.LENGTH_LONG).show()
            return
        }

        try {
            val launchIntent = packageManager.getLaunchIntentForPackage(juegoPackage)
            if (launchIntent != null) {
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                startActivity(launchIntent)
            } else {
                Toast.makeText(this, "⚠️ El juego no está instalado.", Toast.LENGTH_LONG).show()
            }
        } catch (e: Exception) {
            Toast.makeText(this, "No se pudo abrir $juegoNombre: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }

    private fun finalizarTransmision() {
        if (finalizando) return
        finalizando = true

        val id = transmisionId
        if (id == null) {
            stopScreenCaptureService()
            finish()
            return
        }

        lifecycleScope.launch {
            try {
                binding.tvEstado.text = "🟡 FINALIZANDO..."
                finalizarTransmisionEnSupabase(id)
                stopScreenCaptureService()
                transmisionIniciada = false
                Toast.makeText(this@StreamActivity, "🔴 Transmisión finalizada", Toast.LENGTH_SHORT).show()
                finish()
            } catch (e: Exception) {
                finalizando = false
                Toast.makeText(this@StreamActivity, "❌ Error al finalizar: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }

    private suspend fun finalizarTransmisionEnSupabase(id: String) {
        withContext(Dispatchers.IO) {
            SupabaseClient.client
                .from("transmisiones")
                .update(
                    TransmisionFinalizada(
                        estado = "finalizada",
                        fechaFin = Instant.now().toString()
                    )
                ) { filter { eq("id", id) } }
        }
    }

    private fun stopScreenCaptureService() {
        try {
            stopService(Intent(this, ScreenCaptureService::class.java))
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
    }
}

@Serializable
private data class TransmisionInsert(
    @SerialName("streamer_id") val streamerId: String,
    @SerialName("room_name") val roomName: String,
    val titulo: String,
    val categoria: String,
    val descripcion: String,
    @SerialName("tipo_transmision") val tipoTransmision: String,
    val precio: Double,
    val estado: String,
    @SerialName("fecha_inicio") val fechaInicio: String
)

@Serializable
private data class TransmisionCreada(
    val id: String,
    @SerialName("room_name") val roomName: String
)

@Serializable
private data class TransmisionFinalizada(
    val estado: String,
    @SerialName("fecha_fin") val fechaFin: String
)