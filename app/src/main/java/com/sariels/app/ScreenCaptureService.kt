package com.sariels.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import io.livekit.android.room.track.screencapture.ScreenCaptureParams
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

class ScreenCaptureService : Service() {

    companion object {
        private const val TAG = "ScreenCaptureService"
        const val CHANNEL_ID = "sariels_screen_capture"
        const val NOTIFICATION_ID = 1001
        const val EXTRA_RESULT_CODE = "resultCode"
        const val EXTRA_DATA = "data"
        const val EXTRA_LIVEKIT_URL = "livekitUrl"
        const val EXTRA_TOKEN = "token"
        const val EXTRA_TRANSMISION_ID = "transmisionId"
        const val EXTRA_JUEGO_NOMBRE = "juegoNombre"
        const val EXTRA_JUEGO_PACKAGE = "juegoPackage"
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var compartiendo = false

    override fun onCreate() {
        super.onCreate()
        crearCanal()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent == null) { stopSelf(); return START_NOT_STICKY }

        val juegoNombre = intent.getStringExtra(EXTRA_JUEGO_NOMBRE) ?: "Juego"
        val notificacion = crearNotificacion(juegoNombre)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ServiceCompat.startForeground(this, NOTIFICATION_ID, notificacion, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
        } else {
            startForeground(NOTIFICATION_ID, notificacion)
        }

        val resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, -1)
        val projectionData: Intent? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableExtra(EXTRA_DATA, Intent::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableExtra(EXTRA_DATA)
        }
        val url = intent.getStringExtra(EXTRA_LIVEKIT_URL)
        val token = intent.getStringExtra(EXTRA_TOKEN)

        if (resultCode == -1 || projectionData == null || url.isNullOrBlank() || token.isNullOrBlank()) {
            Log.e(TAG, "Datos incompletos para iniciar captura")
            stopSelf()
            return START_NOT_STICKY
        }

        if (!compartiendo) iniciarCaptura(resultCode, projectionData, url, token, juegoNombre)
        return START_NOT_STICKY
    }

    private fun iniciarCaptura(resultCode: Int, projectionData: Intent, url: String, token: String, juegoNombre: String) {
        scope.launch {
            try {
                // 1. Conectar primero con la URL que dio el servidor
                val conectado = LiveKitManager.conectar(applicationContext, url, token)
                if (!conectado) {
                    Log.e(TAG, "No se pudo conectar a LiveKit")
                    stopSelf()
                    return@launch
                }

                // 2. Publicar la pantalla
                val sala = LiveKitManager.room
                val publicado = sala?.localParticipant?.setScreenShareEnabled(
                    true,
                    ScreenCaptureParams(
                        mediaProjectionPermissionResultData = projectionData,
                        notificationId = NOTIFICATION_ID,
                        notification = crearNotificacion(juegoNombre),
                        onStop = {
                            Log.d(TAG, "MediaProjection detenida por el sistema")
                            compartiendo = false
                            stopSelf()
                        }
                    )
                ) ?: false

                if (!publicado) {
                    Log.e(TAG, "LiveKit no activó el screen share")
                    stopSelf()
                    return@launch
                }
                compartiendo = true
                Log.d(TAG, "Screen share publicado")
            } catch (e: Exception) {
                Log.e(TAG, "Error iniciando captura", e)
                compartiendo = false
                stopSelf()
            }
        }
    }

    private fun crearNotificacion(juegoNombre: String): Notification =
        NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Sariel's Live")
            .setContentText("Transmitiendo $juegoNombre")
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()

    private fun crearCanal() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val canal = NotificationChannel(CHANNEL_ID, "Sariel's Live", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Transmisión de juegos en vivo"
                setShowBadge(false)
            }
            getSystemService(NotificationManager::class.java).createNotificationChannel(canal)
        }
    }

    override fun onDestroy() {
        val sala = LiveKitManager.room
        scope.launch {
            try {
                if (compartiendo) sala?.localParticipant?.setScreenShareEnabled(false)
            } catch (e: Exception) {
                Log.e(TAG, "Error deteniendo screen share", e)
            } finally {
                LiveKitManager.desconectar()
            }
        }
        scope.cancel()
        compartiendo = false
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}