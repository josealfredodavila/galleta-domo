@@
-            const { error: rpcErr } = await window.supabaseClient.rpc('vincular_wallet', {
-            p_wallet_address: cuenta,
-            p_chain_id: chainId,
-            p_network_name: ENV.networkName
-        });
-        if (rpcErr) throw rpcErr;
+        // Nueva lógica seguro: solicitar nonce al backend, firmar y enviar la firma
+        const { data: sessionData } = await window.supabaseClient.auth.getSession();
+        const token = sessionData?.session?.access_token;
+        if (!token) throw new Error('No session token');
+
+        // 1) Solicitar nonce
+        const nonceResp = await fetch('/api/wallet/nonce', {
+            method: 'POST',
+            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
+        });
+        const nonceJson = await nonceResp.json().catch(() => ({}));
+        if (!nonceResp.ok || !nonceJson.nonce) throw new Error(nonceJson.error || 'No nonce');
+        const nonce = nonceJson.nonce;
+
+        // 2) Firmar el mensaje EXACTO requerido
+        const mensaje = `Csariel's: vincular wallet\nNonce: ${nonce}\nDirección: ${cuenta}`;
+        let signature;
+        try {
+            signature = await window.ethereum.request({ method: 'personal_sign', params: [mensaje, cuenta] });
+        } catch (e) {
+            throw e;
+        }
+
+        // 3) Enviar firma al backend para validación y guardado
+        const linkResp = await fetch('/api/wallet/link', {
+            method: 'POST',
+            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
+            body: JSON.stringify({ address: cuenta, nonce, signature })
+        });
+        const linkJson = await linkResp.json().catch(() => ({}));
+        if (!linkResp.ok || !linkJson.success) throw new Error(linkJson.error || 'Error vinculando wallet');
@@
