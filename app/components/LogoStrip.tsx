"use client";

import Image from "next/image";

export function LogoStrip() {
  return (
    <div className="logo-strip animate-fade-in-up">
      <Image
        src="/bjc_health_logo.png"
        alt="BJC Health - Connected Care"
        width={220}
        height={63}
        className="h-12 w-auto"
        priority
      />
      <div className="logo-divider" />
      <Image
        src="/smec_ai_logo_horizontal.png"
        alt="SMEC AI"
        width={180}
        height={42}
        className="h-10 w-auto"
        priority
      />
    </div>
  );
}
