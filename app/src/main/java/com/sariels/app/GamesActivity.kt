package com.sariels.app

import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.sariels.app.databinding.ActivityGamesBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

class GamesActivity : AppCompatActivity() {

    private lateinit var binding: ActivityGamesBinding
    private lateinit var gamesAdapter: GamesAdapter
    private val gamesList = mutableListOf<Juego>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityGamesBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // ✅ MANEJAR DEEP LINK DESDE HTML
        intent?.data?.let { uri ->
            val juegoId = uri.getQueryParameter("juego_id")
            val packageName = uri.getQueryParameter("package_name")
            val nombre = uri.getQueryParameter("nombre")
            
            if (juegoId != null && packageName != null && packageName.isNotBlank()) {
                val intent = Intent(this, StreamActivity::class.java).apply {
                    putExtra(StreamActivity.EXTRA_JUEGO_NOMBRE, nombre ?: "Juego")
                    putExtra(StreamActivity.EXTRA_JUEGO_PACKAGE, packageName)
                    putExtra(StreamActivity.EXTRA_JUEGO_ID, juegoId)
                }
                startActivity(intent)
                finish()
                return
            }
        }

        setupRecyclerView()
        cargarJuegos()
    }

    private fun setupRecyclerView() {
        gamesAdapter = GamesAdapter { juego -> abrirFlujoTransmision(juego) }
        binding.rvGames.apply {
            layoutManager = LinearLayoutManager(this@GamesActivity)
            adapter = gamesAdapter
        }
    }

    private fun cargarJuegos() {
        lifecycleScope.launch {
            try {
                val juegos = withContext(Dispatchers.IO) {
                    SupabaseClient.client
                        .from("juegos")
                        .select { filter { eq("activo", true) } }
                        .decodeList<Juego>()
                }

                gamesList.clear()
                gamesList.addAll(juegos)
                checkInstalledGames()
                gamesAdapter.submitList(gamesList.toList())

            } catch (e: Exception) {
                Toast.makeText(this@GamesActivity, "Error al cargar juegos: ${e.message}", Toast.LENGTH_LONG).show()
                e.printStackTrace()
            }
        }
    }

    private fun checkInstalledGames() {
        val packageManager = packageManager
        gamesList.forEach { juego ->
            val packageName = juego.packageName
            juego.instalado = if (!packageName.isNullOrBlank()) {
                try {
                    packageManager.getPackageInfo(packageName, PackageManager.PackageInfoFlags.of(0))
                    true
                } catch (_: PackageManager.NameNotFoundException) {
                    false
                }
            } else {
                false
            }
        }
        gamesAdapter.submitList(gamesList.toList())
    }

    private fun abrirFlujoTransmision(juego: Juego) {
        if (juego.packageName.isNullOrBlank()) {
            Toast.makeText(this, "Este juego no tiene package_name configurado.", Toast.LENGTH_LONG).show()
            return
        }

        val intent = Intent(this, StreamActivity::class.java).apply {
            putExtra(StreamActivity.EXTRA_JUEGO_NOMBRE, juego.nombre)
            putExtra(StreamActivity.EXTRA_JUEGO_PACKAGE, juego.packageName)
            putExtra(StreamActivity.EXTRA_JUEGO_ID, juego.id)
        }
        startActivity(intent)
    }

    fun abrirJuegoInstalado(packageName: String): Boolean {
        return try {
            val intent = packageManager.getLaunchIntentForPackage(packageName)
            if (intent != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                startActivity(intent)
                true
            } else {
                abrirGooglePlay(packageName)
                false
            }
        } catch (e: Exception) {
            Toast.makeText(this, "No se pudo abrir el juego: ${e.message}", Toast.LENGTH_LONG).show()
            false
        }
    }

    private fun abrirGooglePlay(packageName: String) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$packageName")))
        } catch (_: Exception) {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=$packageName")))
        }
    }
}

@Serializable
data class Juego(
    val id: String,
    val nombre: String,
    val categoria: String? = "gaming",
    val icono: String? = null,
    val activo: Boolean = true,
    @SerialName("package_name")
    val packageName: String? = null,
    @kotlinx.serialization.Transient
    var instalado: Boolean = false
)