// ================================================================
// INTERNET · FONDO (Canvas de estrellas animadas)
// ================================================================
// Dibuja estrellas titilantes en el canvas de fondo. Respeta el
// tema día (oculto por CSS) y se pausa si la pestaña no está visible.
// Depende de: internet-config.js
// ================================================================

function initStars() {
    var canvas = document.getElementById('stars-canvas');
    if (!canvas) return;

    var ctx = canvas.getContext('2d');
    var width, height, stars = [];
    var isVisible = true;
    var isMobile = window.innerWidth < 600;
    var STAR_COUNT = isMobile ? 60 : 120;

    function resize() {
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = width;
        canvas.height = height;
        createStars();
    }

    function createStars() {
        stars = [];
        for (var i = 0; i < STAR_COUNT; i++) {
            stars.push({
                x: Math.random() * width,
                y: Math.random() * height,
                radius: Math.random() * 0.8 + 0.2,
                speed: Math.random() * 0.005 + 0.002,
                opacity: Math.random() * 0.5 + 0.2,
                twinklePhase: Math.random() * Math.PI * 2
            });
        }
    }

    function draw() {
        if (!isVisible) {
            requestAnimationFrame(draw);
            return;
        }

        ctx.clearRect(0, 0, width, height);

        for (var i = 0; i < stars.length; i++) {
            var star = stars[i];
            var opacity = star.opacity * (0.6 + 0.4 * Math.sin(star.twinklePhase));

            ctx.beginPath();
            ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, ' + opacity + ')';
            ctx.fill();

            star.twinklePhase += 0.02;
            star.y += star.speed;

            if (star.y > height) {
                star.y = 0;
                star.x = Math.random() * width;
            }
        }

        requestAnimationFrame(draw);
    }

    resize();
    draw();

    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', function() {
        isVisible = !document.hidden;
    });
}