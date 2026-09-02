package com.sariels.app

import android.graphics.Color
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView

class GamesAdapter(
    private val onGameClick: (Juego) -> Unit
) : RecyclerView.Adapter<GamesAdapter.GameViewHolder>() {

    private val juegos = mutableListOf<Juego>()

    fun submitList(nuevosJuegos: List<Juego>) {
        juegos.clear()
        juegos.addAll(nuevosJuegos)
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): GameViewHolder {
        val context = parent.context

        val container = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(24, 20, 24, 20)
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
            setBackgroundColor(Color.rgb(28, 28, 32))
            isClickable = true
            isFocusable = true
        }

        val icono = TextView(context).apply {
            textSize = 32f
            gravity = Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(60, 60)
        }

        val textos = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(20, 0, 0, 0)
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        }

        val nombre = TextView(context).apply {
            textSize = 18f
            setTextColor(Color.WHITE)
            setTypeface(null, android.graphics.Typeface.BOLD)
        }

        val categoria = TextView(context).apply {
            textSize = 14f
            setTextColor(Color.rgb(180, 180, 185))
        }

        val estado = TextView(context).apply {
            textSize = 13f
            setTextColor(Color.rgb(130, 220, 150))
        }

        textos.addView(nombre)
        textos.addView(categoria)
        textos.addView(estado)

        container.addView(icono)
        container.addView(textos)

        return GameViewHolder(container, icono, nombre, categoria, estado)
    }

    override fun onBindViewHolder(holder: GameViewHolder, position: Int) {
        val juego = juegos[position]

        holder.nombre.text = juego.nombre
        holder.categoria.text = juego.categoria ?: "gaming"
        holder.icono.text = "🎮"

        holder.estado.text = if (juego.instalado) {
            "✓ Instalado · Tocar para transmitir"
        } else {
            "Descargar desde Google Play"
        }

        holder.itemView.setOnClickListener { onGameClick(juego) }
    }

    override fun getItemCount(): Int = juegos.size

    class GameViewHolder(
        itemView: View,
        val icono: TextView,
        val nombre: TextView,
        val categoria: TextView,
        val estado: TextView
    ) : RecyclerView.ViewHolder(itemView)
}