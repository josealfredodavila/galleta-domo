package com.sariels.app

import android.content.Context
import android.util.Log
import io.livekit.android.room.Room
import io.livekit.android.room.RoomOptions
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

object LiveKitManager {

    private const val TAG = "LiveKitManager"
    private const val BACKEND_URL = "https://galleta-domo-production.up.railway.app"
    private const val LIVEKIT_URL = "wss://csariels-domo-57ujk04t.livekit.cloud"

    var room: Room? = null
        private set

    private var isConnected = false

    fun getLiveKitUrl(): String = LIVEKIT_URL

    suspend fun obtenerToken(roomName: String, identity: String): String {
        val session = SupabaseClient.client.auth.currentSessionOrNull()
            ?: throw IllegalStateException("No hay sesión de Supabase activa")

        val encodedRoom = URLEncoder.encode(roomName, "UTF-8")
        val url = URL("$BACKEND_URL/api/token?room=$encodedRoom&identity=$identity")

        val connection = url.openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "GET"
            connection.setRequestProperty("Authorization", "Bearer ${session.accessToken}")
            connection.setRequestProperty("Accept", "application/json")
            connection.connectTimeout = 15000
            connection.readTimeout = 15000

            val responseCode = connection.responseCode
            if (responseCode !in 200..299) {
                val errorText = connection.errorStream?.bufferedReader()?.use { it.readText() }
                throw IllegalStateException("Backend LiveKit HTTP $responseCode: ${errorText ?: "sin respuesta"}")
            }

            val response = connection.inputStream.bufferedReader().use { it.readText() }
            val token = Regex("\"token\"\\s*:\\s*\"([^\"]+)\"").find(response)?.groupValues?.getOrNull(1)

            if (token.isNullOrBlank()) {
                throw IllegalStateException("El backend no devolvió un token LiveKit válido")
            }

            return token
        } finally {
            connection.disconnect()
        }
    }

    // ✅ SUSPEND Y ESPERA LA CONEXIÓN
    suspend fun conectar(context: Context, roomName: String, token: String): Boolean {
        if (isConnected) {
            Log.d(TAG, "Ya conectado a LiveKit")
            return true
        }

        return try {
            Log.d(TAG, "Conectando a LiveKit: $roomName")
            val options = RoomOptions.Builder()
                .autoSubscribe(true)
                .build()

            room = Room(context, options)
            room?.connect(LIVEKIT_URL, token)
            isConnected = true
            Log.d(TAG, "✅ Conectado a LiveKit: $roomName")
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
            room = null
            isConnected = false
            Log.d(TAG, "🔌 Desconectado de LiveKit")
        } catch (e: Exception) {
            Log.e(TAG, "Error desconectando LiveKit", e)
        }
    }
}