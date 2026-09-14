// ============================================================
// AGREGAR CONTACTO (con reciprocidad bidireccional)
// ============================================================

async function agregarContacto(contactoId) {
    try {
        const client = sb();
        const session = await getSession();

        if (!client || !session) {
            showToast('⚠️ Inicia sesión', 'error');
            return;
        }

        if (contactoId === session.user.id) {
            showToast('⚠️ No puedes agregarte a ti mismo', 'warning');
            return;
        }

        // 1. Verificar si ya existe el contacto (A → B)
        const { data: existe, error: errorExiste } = await client
            .from('contactos')
            .select('id')
            .eq('usuario_id', session.user.id)
            .eq('contacto_id', contactoId)
            .maybeSingle();

        if (errorExiste) throw errorExiste;

        if (existe) {
            showToast('⚠️ Ya es tu contacto', 'warning');
            return;
        }

        // 2. Insertar el contacto A → B
        const { error: errorAB } = await client
            .from('contactos')
            .insert({
                usuario_id: session.user.id,
                contacto_id: contactoId,
                estado: 'activo',
                es_favorito: false
            });

        if (errorAB) throw errorAB;

        // 3. Insertar el contacto recíproco B → A
        //    (Si ya existe por un trigger, ON CONFLICT DO NOTHING evita el error)
        const { error: errorBA } = await client
            .from('contactos')
            .insert({
                usuario_id: contactoId,
                contacto_id: session.user.id,
                estado: 'activo',
                es_favorito: false
            });

        // Si falla por duplicado (contacto ya existente), no es un error crítico
        if (errorBA && errorBA.code !== '23505') {
            console.warn('Error creando contacto recíproco:', errorBA);
        }

        showToast('✅ Contacto agregado', 'success');

        // 4. Limpiar UI del modal
        const input = document.getElementById('searchInputModal');
        const resultados = document.getElementById('resultadosBusqueda');

        if (input) input.value = '';
        if (resultados) resultados.innerHTML = '';

        cerrarModalBuscar();

        // 5. Recargar la lista
        await cargarContactos();

    } catch (error) {
        console.error('Error agregando contacto:', error);
        showToast('❌ Error al agregar contacto', 'error');
    }
}