@@
-        // 3) Enviar firma al backend para validación y guardado
-        const linkResp = await fetch('/api/wallet/link', {
-            method: 'POST',
-            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
-            body: JSON.stringify({ address: cuenta, nonce, signature })
-        });
+        // 3) Enviar firma al backend para validación y guardado (incluyendo chain y network)
+        const linkResp = await fetch('/api/wallet/link', {
+            method: 'POST',
+            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
+            body: JSON.stringify({ address: cuenta, nonce, signature, chain_id: chainId, network_name: ENV.networkName })
+        });
         const linkJson = await linkResp.json().catch(() => ({}));
         if (!linkResp.ok || !linkJson.success) throw new Error(linkJson.error || 'Error vinculando wallet');
