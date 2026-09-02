package com.sariels.app

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.realtime.Realtime

object SupabaseClient {

    private const val SUPABASE_URL =
        "https://zultnlogdoajehbswlih.supabase.co"

    private const val SUPABASE_KEY =
        "sb_publishable_S3jONAz3mRO4JKBRhUdI1A_-nsyVhKu"

    val client: SupabaseClient by lazy {
        createSupabaseClient(
            supabaseUrl = SUPABASE_URL,
            supabaseKey = SUPABASE_KEY
        ) {
            install(Auth)
            install(Postgrest)
            install(Realtime)
        }
    }
}