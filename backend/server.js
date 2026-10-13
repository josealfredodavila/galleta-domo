@@
 const app = express();
+
+// --------------------------------------------------------------
+// Process-level handlers for stability (security/backend-hardening)
+// uncaughtException: log and exit cleanly so platform restarts the
+// container. unhandledRejection: log only (no immediate exit).
+// --------------------------------------------------------------
+process.on('uncaughtException', (err) => {
+    console.error('❌ Uncaught Exception:', err && err.stack ? err.stack : err);
+    // Give the runtime a brief moment to flush logs and exit
+    setTimeout(() => process.exit(1), 500);
+});
+
+process.on('unhandledRejection', (reason, promise) => {
+    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
+    // Do not exit the process — allow for graceful handling and monitoring
+});
@@
 montarRouter('/api/live', './routes/live', 'routes/live');
+montarRouter('/api/wallet', './routes/wallet', 'routes/wallet');
 mont arRouter('/api/geo', './routes/geo', 'routes/geo');
@@
