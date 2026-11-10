// functions/api/[[path]].js
export async function onRequest(context) {
  const url = new URL(context.request.url);
  
  // Construye la URL destino en Railway
  const targetUrl = `https://galleta-domo-production.up.railway.app${url.pathname}${url.search}`;
  
  // Copia la petición original (headers, body, método)
  const proxyRequest = new Request(targetUrl, {
    method: context.request.method,
    headers: context.request.headers,
    body: context.request.body,
    redirect: 'follow'
  });

  // Realiza la petición a Railway
  const response = await fetch(proxyRequest);
  
  // Devuelve la respuesta al navegador
  return response;
}