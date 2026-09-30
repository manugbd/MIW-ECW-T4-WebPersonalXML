/**
 * Script principal de la aplicación web personal de Manuel García Baldó
 * Asignatura: Estándares y Computación Web (ECW)
 * 
 * Funcionalidad: Mejora progresiva, actualización de año dinámico y accesibilidad.
 */

(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    // 1. Actualización progresiva del año de copyright en el pie de página
    const copyrightTime = document.querySelector("footer time");
    if (copyrightTime) {
      copyrightTime.textContent = new Date().getFullYear().toString();
    }

    // 2. Comprobación y mejora de accesibilidad para reproductores multimedia nativos
    const mediaElements = document.querySelectorAll("video, audio");
    mediaElements.forEach(function (media) {
      media.addEventListener("play", function () {
        // Pausar otros reproductores si uno inicia reproducción
        mediaElements.forEach(function (otherMedia) {
          if (otherMedia !== media && !otherMedia.paused) {
            otherMedia.pause();
          }
        });
      });
    });
  });
})();
