"use client";

/**
 * InstructionalVideo — autoplay-muted walkthrough shown on the login page.
 * Source: public/login-instructional.mp4 (rendered from scripts/video/remotion).
 * Loop disabled; users can replay via the controls.
 */
export function InstructionalVideo() {
  return (
    <div className="card overflow-hidden animate-fade-in-up">
      <div className="px-5 pt-4 pb-3">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          How the portal works
        </h2>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">
          A 90-second walkthrough — production runs the same engine
          unattended.
        </p>
      </div>
      <div className="aspect-video bg-black">
        <video
          src="/login-instructional.mp4"
          poster="/login-instructional-poster.jpg"
          autoPlay
          muted
          playsInline
          controls
          preload="metadata"
          className="w-full h-full object-cover"
        >
          Your browser does not support embedded video.
        </video>
      </div>
    </div>
  );
}
