package com.sariels.app

import android.content.Context
import android.util.Log
import io.github.jan.supabase.gotrue.auth
import io.livekit.android.room.Room
import io.livekit.android.room.RoomOptions
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.net.HttpURLConnection
import java.net.URL

object LiveKitManager {

    private const val TAG = "LiveKitManager"
    private const val BACKEND_URL = "https://galleta-domo-production.up.railway.app"

    var room: Room? = null
        private set

    private var isConnected = false

    @Serializable
    private data class TokenRequest(val streamId: Int, val rol: String)

    @Serializable
    private data class TokenResponse(val token: String, val url: String? = null, val canPublish: Boolean = false)

    /**
     * Pide al servidor el token de LiveKit para una transmisión.
     * El servidor decide la sala y si el usuario puede publicar.
     */
    suspend fun obtenerToken(streamId: Int, rol: String = "streamer"): TokenResponse =
        withContext(Dispatchers.IO) {
            val session = SupabaseProvider.client.auth.currentSessionOrNull()
                ?: throw IllegalStateException("No hay sesión de Supabase activa")

            val body = Json.encodeToString(TokenRequest.serializer(), TokenRequest(streamId, rol))
            val connection = URL("$BACKEND_URL/api/livekit/token").openConnection() as HttpURLConnection
            try {
                connection.requestMethod = "POST"
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.setRequestProperty("Accept", "application/json")
                connection.setRequestProperty("Authorization", "Bearer ${session.accessToken}")
                connection.connectTimeout = 15000
                connection.readTimeout = 15000
                connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }

                val code = connection.responseCode
                if (code !in 200..299) {
                    val err = connection.errorStream?.bufferedReader()?.use { it.readText() }
                    throw IllegalStateException("Token LiveKit HTTP $code: ${err ?: "sin respuesta"}")
                }

                val respuesta = connection.inputStream.bufferedReader().use { it.readText() }
                val parsed = Json { ignoreUnknownKeys = true }.decodeFromString(TokenResponse.serializer(), respuesta)
                if (parsed.token.isBlank()) throw IllegalStateException("El servidor no devolvió un token")
                if (!parsed.canPublish) throw IllegalStateException("El servidor no autorizó transmitir")
                parsed
            } finally {
                connection.disconnect()
            }
        }

    /** Conecta la sala usando la URL que devolvió el servidor. */
    suspend fun conectar(context: Context, url: String, token: String): Boolean {
        if (isConnected) return true
        return try {
            val options = RoomOptions.Builder().autoSubscribe(true).build()
            val nuevaSala = Room(context, options)
            nuevaSala.connect(url, token)
            room = nuevaSala
            isConnected = true
            Log.d(TAG, "Conectado a LiveKit")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Error conectando a LiveKit", e)
            isConnected = false
            false
        }
    }

    fun desconectar() {
        try {
            room?.disconnect()
        } catch (e: Exception) {
            Log.e(TAG, "Error desconectando LiveKit", e)
        } finally {
            room = null
            isConnected = false
        }
    }
}