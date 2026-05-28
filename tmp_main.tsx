import.meta.env = {"BASE_URL": "/", "DEV": true, "MODE": "development", "PROD": false, "SSR": false, "VITE_SUPABASE_PROJECT_ID": "vuzfnlbnjepngerclxqm", "VITE_SUPABASE_PUBLISHABLE_KEY": "sb_publishable_MDo-be2ubnNahNzjZHfc1g_piDzesJp", "VITE_SUPABASE_URL": "https://vuzfnlbnjepngerclxqm.supabase.co"};import __vite__cjsImport0_react_jsxDevRuntime from "/node_modules/.vite/deps/react_jsx-dev-runtime.js?v=0cb4363b"; const _jsxDEV = __vite__cjsImport0_react_jsxDevRuntime["jsxDEV"];
import __vite__cjsImport1_react from "/node_modules/.vite/deps/react.js?v=b870c4c0"; const StrictMode = __vite__cjsImport1_react["StrictMode"];
import __vite__cjsImport2_reactDom_client from "/node_modules/.vite/deps/react-dom_client.js?v=d78a520c"; const createRoot = __vite__cjsImport2_reactDom_client["createRoot"];
import App from "/src/App.tsx";
import "/src/index.css";
import { initSentry } from "/src/lib/sentry.ts";
import { Capacitor } from "/node_modules/.vite/deps/@capacitor_core.js?v=e50fcd11";
initSentry();
if ('serviceWorker' in navigator && Capacitor.isNativePlatform()) {
    navigator.serviceWorker.getRegistrations().then((registrations)=>{
        registrations.forEach((registration)=>registration.unregister());
    });
    if ('caches' in window) {
        caches.keys().then((keys)=>keys.forEach((key)=>caches.delete(key)));
    }
} else if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', ()=>{
        // Determine the correct path for the service worker
        const swPath = `${import.meta.env.BASE_URL}sw.js`;
        navigator.serviceWorker.register(swPath).catch((err)=>{
            console.log('SW registration failed: ', err);
        });
    });
}
createRoot(document.getElementById('root')).render(/*#__PURE__*/ _jsxDEV(StrictMode, {
    children: /*#__PURE__*/ _jsxDEV(App, {}, void 0, false, {
        fileName: "D:/Devlopment/git/TatvishaEnterprises/src/main.tsx",
        lineNumber: 29,
        columnNumber: 5
    }, this)
}, void 0, false, {
    fileName: "D:/Devlopment/git/TatvishaEnterprises/src/main.tsx",
    lineNumber: 28,
    columnNumber: 3
}, this));

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1haW4udHN4Il0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7U3RyaWN0TW9kZX0gZnJvbSAncmVhY3QnO1xuaW1wb3J0IHtjcmVhdGVSb290fSBmcm9tICdyZWFjdC1kb20vY2xpZW50JztcbmltcG9ydCBBcHAgZnJvbSAnLi9BcHAudHN4JztcbmltcG9ydCAnLi9pbmRleC5jc3MnO1xuaW1wb3J0IHsgaW5pdFNlbnRyeSB9IGZyb20gJy4vbGliL3NlbnRyeSc7XG5pbXBvcnQgeyBDYXBhY2l0b3IgfSBmcm9tICdAY2FwYWNpdG9yL2NvcmUnO1xuXG5pbml0U2VudHJ5KCk7XG5cbmlmICgnc2VydmljZVdvcmtlcicgaW4gbmF2aWdhdG9yICYmIENhcGFjaXRvci5pc05hdGl2ZVBsYXRmb3JtKCkpIHtcbiAgbmF2aWdhdG9yLnNlcnZpY2VXb3JrZXIuZ2V0UmVnaXN0cmF0aW9ucygpLnRoZW4oKHJlZ2lzdHJhdGlvbnMpID0+IHtcbiAgICByZWdpc3RyYXRpb25zLmZvckVhY2goKHJlZ2lzdHJhdGlvbikgPT4gcmVnaXN0cmF0aW9uLnVucmVnaXN0ZXIoKSk7XG4gIH0pO1xuICBpZiAoJ2NhY2hlcycgaW4gd2luZG93KSB7XG4gICAgY2FjaGVzLmtleXMoKS50aGVuKChrZXlzKSA9PiBrZXlzLmZvckVhY2goKGtleSkgPT4gY2FjaGVzLmRlbGV0ZShrZXkpKSk7XG4gIH1cbn0gZWxzZSBpZiAoJ3NlcnZpY2VXb3JrZXInIGluIG5hdmlnYXRvciAmJiBpbXBvcnQubWV0YS5lbnYuUFJPRCkge1xuICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbG9hZCcsICgpID0+IHtcbiAgICAvLyBEZXRlcm1pbmUgdGhlIGNvcnJlY3QgcGF0aCBmb3IgdGhlIHNlcnZpY2Ugd29ya2VyXG4gICAgY29uc3Qgc3dQYXRoID0gYCR7aW1wb3J0Lm1ldGEuZW52LkJBU0VfVVJMfXN3LmpzYDtcbiAgICBuYXZpZ2F0b3Iuc2VydmljZVdvcmtlci5yZWdpc3Rlcihzd1BhdGgpLmNhdGNoKGVyciA9PiB7XG4gICAgICBjb25zb2xlLmxvZygnU1cgcmVnaXN0cmF0aW9uIGZhaWxlZDogJywgZXJyKTtcbiAgICB9KTtcbiAgfSk7XG59XG5cbmNyZWF0ZVJvb3QoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3Jvb3QnKSEpLnJlbmRlcihcbiAgPFN0cmljdE1vZGU+XG4gICAgPEFwcCAvPlxuICA8L1N0cmljdE1vZGU+LFxuKTtcbiJdLCJuYW1lcyI6WyJTdHJpY3RNb2RlIiwiY3JlYXRlUm9vdCIsIkFwcCIsImluaXRTZW50cnkiLCJDYXBhY2l0b3IiLCJuYXZpZ2F0b3IiLCJpc05hdGl2ZVBsYXRmb3JtIiwic2VydmljZVdvcmtlciIsImdldFJlZ2lzdHJhdGlvbnMiLCJ0aGVuIiwicmVnaXN0cmF0aW9ucyIsImZvckVhY2giLCJyZWdpc3RyYXRpb24iLCJ1bnJlZ2lzdGVyIiwid2luZG93IiwiY2FjaGVzIiwia2V5cyIsImtleSIsImRlbGV0ZSIsImVudiIsIlBST0QiLCJhZGRFdmVudExpc3RlbmVyIiwic3dQYXRoIiwiQkFTRV9VUkwiLCJyZWdpc3RlciIsImNhdGNoIiwiZXJyIiwiY29uc29sZSIsImxvZyIsImRvY3VtZW50IiwiZ2V0RWxlbWVudEJ5SWQiLCJyZW5kZXIiXSwibWFwcGluZ3MiOiI7QUFBQSxTQUFRQSxVQUFVLFFBQU8sUUFBUTtBQUNqQyxTQUFRQyxVQUFVLFFBQU8sbUJBQW1CO0FBQzVDLE9BQU9DLFNBQVMsWUFBWTtBQUM1QixPQUFPLGNBQWM7QUFDckIsU0FBU0MsVUFBVSxRQUFRLGVBQWU7QUFDMUMsU0FBU0MsU0FBUyxRQUFRLGtCQUFrQjtBQUU1Q0Q7QUFFQSxJQUFJLG1CQUFtQkUsYUFBYUQsVUFBVUUsZ0JBQWdCLElBQUk7SUFDaEVELFVBQVVFLGFBQWEsQ0FBQ0MsZ0JBQWdCLEdBQUdDLElBQUksQ0FBQyxDQUFDQztRQUMvQ0EsY0FBY0MsT0FBTyxDQUFDLENBQUNDLGVBQWlCQSxhQUFhQyxVQUFVO0lBQ2pFO0lBQ0EsSUFBSSxZQUFZQyxRQUFRO1FBQ3RCQyxPQUFPQyxJQUFJLEdBQUdQLElBQUksQ0FBQyxDQUFDTyxPQUFTQSxLQUFLTCxPQUFPLENBQUMsQ0FBQ00sTUFBUUYsT0FBT0csTUFBTSxDQUFDRDtJQUNuRTtBQUNGLE9BQU8sSUFBSSxtQkFBbUJaLGFBQWEsWUFBWWMsR0FBRyxDQUFDQyxJQUFJLEVBQUU7SUFDL0ROLE9BQU9PLGdCQUFnQixDQUFDLFFBQVE7UUFDOUIsb0RBQW9EO1FBQ3BELE1BQU1DLFNBQVMsR0FBRyxZQUFZSCxHQUFHLENBQUNJLFFBQVEsQ0FBQyxLQUFLLENBQUM7UUFDakRsQixVQUFVRSxhQUFhLENBQUNpQixRQUFRLENBQUNGLFFBQVFHLEtBQUssQ0FBQ0MsQ0FBQUE7WUFDN0NDLFFBQVFDLEdBQUcsQ0FBQyw0QkFBNEJGO1FBQzFDO0lBQ0Y7QUFDRjtBQUVBekIsV0FBVzRCLFNBQVNDLGNBQWMsQ0FBQyxTQUFVQyxNQUFNLGVBQ2pELFFBQUMvQjtjQUNDLGNBQUEsUUFBQ0UifQ==
