// DIAGNÓSTICO TEMPORAL: borrar después de revisar
app.get('/diag-contactos', (req, res) => {
    const base = path.join(publicPath, 'features', 'contactos');
    const existe = fs.existsSync(base);
    return res.json({
        publicPath,
        carpetaContactosExiste: existe,
        contenido: existe ? fs.readdirSync(base) : [],
        carpetaMensajesExiste: fs.existsSync(path.join(publicPath, 'features', 'mensajes')),
        mensajesContactosHtml: fs.existsSync(path.join(publicPath, 'features', 'mensajes', 'contactos.html'))
    });
});