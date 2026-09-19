/* MichiHub - aviso de conexión
   Muestra una barrita cuando el dispositivo se queda sin internet y otra breve cuando vuelve. */
(function(){
    let aviso = null;
    let temporizador = null;

    function crearAviso(){
        if(aviso) return aviso;
        aviso = document.createElement("div");
        aviso.setAttribute("role", "status");
        aviso.setAttribute("aria-live", "polite");
        aviso.style.cssText = [
            "position:fixed",
            "left:50%",
            "bottom:16px",
            "transform:translateX(-50%)",
            "max-width:min(92vw, 420px)",
            "padding:10px 18px",
            "border-radius:999px",
            "background:#4a4238",
            "color:#f4f0ea",
            "font:600 14px/1.35 Nunito, Arial, sans-serif",
            "text-align:center",
            "box-shadow:0 4px 16px rgba(0,0,0,0.25)",
            "z-index:2147483000",
            "display:none"
        ].join(";");
        document.body.appendChild(aviso);
        return aviso;
    }

    function mostrar(texto, autoOcultar){
        const el = crearAviso();
        clearTimeout(temporizador);
        el.textContent = texto;
        el.style.display = "block";
        if(autoOcultar){
            temporizador = setTimeout(() => { el.style.display = "none"; }, 2500);
        }
    }

    function sinConexion(){
        mostrar("📴 Sin conexión. El chat, la radio y el inicio de sesión necesitan internet.", false);
    }

    function conConexion(){
        mostrar("✅ Conexión recuperada", true);
    }

    function iniciar(){
        window.addEventListener("offline", sinConexion);
        window.addEventListener("online", conConexion);
        if(!navigator.onLine) sinConexion();
    }

    if(document.body){
        iniciar();
    }else{
        document.addEventListener("DOMContentLoaded", iniciar);
    }
})();
