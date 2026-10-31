package com.sariels.app

// Alias para código existente que usa SupabaseClient.client.
// La instancia real vive en SupabaseProvider.
object SupabaseClient {
    val client get() = SupabaseProvider.client
}