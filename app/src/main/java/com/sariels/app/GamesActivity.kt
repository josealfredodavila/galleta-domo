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
import io.github.jan.supabase.postgrest.from
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

        // Deep link: sariels://stream?juego_id=...&package_name=...&nombre=...
        intent?.data?.let { uri ->
            val juegoId = uri.getQueryParameter("juego_id")
            val packageName = uri.getQueryParameter("package_name")
            val nombre = uri.getQueryParameter("nombre")
            if (!juegoId.isNullOrBlank() && !packageName.isNullOrBlank()) {
                abrirStream(nombre ?: "Juego", packageName, juegoId)
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
                    SupabaseProvider.client
                        .from("juegos")
                        .select { filter { eq("activo", true) } }
                        .decodeList<Juego>()
                }
                gamesList.clear()
                gamesList.addAll(juegos)
                marcarInstalados()
                gamesAdapter.submitList(gamesList.toList())
            } catch (e: Exception) {
                Toast.makeText(this@GamesActivity, "Error al cargar juegos", Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun marcarInstalados() {
        gamesList.forEach { juego ->
            val pkg = juego.packageName
            juego.instalado = !pkg.isNullOrBlank() && try {
                packageManager.getPackageInfo(pkg, PackageManager.PackageInfoFlags.of(0))
                true
            } catch (_: PackageManager.NameNotFoundException) {
                false
            }
        }
    }

    private fun abrirFlujoTransmision(juego: Juego) {
        val pkg = juego.packageName
        if (pkg.isNullOrBlank()) {
            Toast.makeText(this, "Este juego no tiene package_name configurado.", Toast.LENGTH_LONG).show()
            return
        }
        if (!juego.instalado) {
            abrirGooglePlay(pkg)
            return
        }
        abrirStream(juego.nombre, pkg, juego.id)
    }

    private fun abrirStream(nombre: String, packageName: String, juegoId: String) {
        val intent = Intent(this, StreamActivity::class.java).apply {
            putExtra(StreamActivity.EXTRA_JUEGO_NOMBRE, nombre)
            putExtra(StreamActivity.EXTRA_JUEGO_PACKAGE, packageName)
            putExtra(StreamActivity.EXTRA_JUEGO_ID, juegoId)
        }
        startActivity(intent)
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
    @SerialName("package_name") val packageName: String? = null,
    @kotlinx.serialization.Transient var instalado: Boolean = false
)