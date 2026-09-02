package com.sariels.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
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
        const val EXTRA_ROOM_NAME = "roomName"
        const val EXTRA_TOKEN = "token"
        const val EXTRA_TRANSMISION_ID = "transmisionId"
        const val EXTRA_JUEGO_NOMBRE = "juegoNombre"
        const val EXTRA_JUEGO_PACKAGE = "juegoPackage"
    }

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var transmisionId: String? = null
    private var screenShareActive = false

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent == null) {
            Log.e(TAG, "Servicio iniciado sin Intent.")
            stopSelf()
            return START_NOT_STICKY
        }

        val notification = createNotification(intent.getStringExtra(EXTRA_JUEGO_NOMBRE) ?: "Juego")

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ServiceCompat.startForeground(
                this,
                NOTIFICATION_ID,
                notification,
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        val resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, -1)
        val projectionData = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableExtra(EXTRA_DATA, Intent::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableExtra(EXTRA_DATA)
        }

        val roomName = intent.getStringExtra(EXTRA_ROOM_NAME)
        val token = intent.getStringExtra(EXTRA_TOKEN)
        transmisionId = intent.getStringExtra(EXTRA_TRANSMISION_ID)
        val juegoNombre = intent.getStringExtra(EXTRA_JUEGO_NOMBRE) ?: "Juego"

        if (resultCode == -1 || projectionData == null || roomName.isNullOrBlank() || token.isNullOrBlank()) {
            Log.e(TAG, "Datos incompletos para iniciar captura.")
            stopSelf()
            return START_NOT_STICKY
        }

        if (!screenShareActive) {
            iniciarLiveKit(resultCode, projectionData, roomName, token, juegoNombre)
        }

        return START_NOT_STICKY
    }

    private fun iniciarLiveKit(resultCode: Int, projectionData: Intent, roomName: String, token: String, juegoNombre: String) {
        serviceScope.launch {
            try {
                Log.d(TAG, "Conectando a LiveKit...")
                LiveKitManager.conectar(applicationContext, roomName, token)
                Log.d(TAG, "LiveKit conectado.")

                val resultado = LiveKitManager.room
                    ?.localParticipant
                    ?.setScreenShareEnabled(
                        true,
                        ScreenCaptureParams(
                            mediaProjectionPermissionResultData = projectionData,
                            notificationId = NOTIFICATION_ID,
                            notification = createNotification(juegoNombre),
                            onStop = {
                                Log.d(TAG, "MediaProjection se detuvo.")
                                screenShareActive = false
                                stopSelf()
                            }
                        )
                    ) ?: false

                if (!resultado) {
                    Log.e(TAG, "LiveKit no pudo activar screen share.")
                    stopSelf()
                    return@launch
                }

                screenShareActive = true
                Log.d(TAG, "🟢 Screen Share publicado en LiveKit.")

            } catch (e: Exception) {
                Log.e(TAG, "Error iniciando LiveKit.", e)
                screenShareActive = false
                stopSelf()
            }
        }
    }

    private fun createNotification(juegoNombre: String): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("🔴 Sariel's Live")
            .setContentText("Transmitiendo $juegoNombre")
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Sariel's Live",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Transmisión de juegos en vivo"
                setShowBadge(false)
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    override fun onDestroy() {
        Log.d(TAG, "Deteniendo ScreenCaptureService.")
        serviceScope.launch {
            try {
                if (screenShareActive) {
                    LiveKitManager.room?.localParticipant?.setScreenShareEnabled(false)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error deteniendo screen share.", e)
            } finally {
                try {
                    LiveKitManager.desconectar()
                } catch (e: Exception) {
                    Log.e(TAG, "Error desconectando LiveKit.", e)
                }
            }
        }
        serviceScope.cancel()
        screenShareActive = false
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}