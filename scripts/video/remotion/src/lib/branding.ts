import branding from "../../../branding.json";

export type Branding = {
  company: string;
  productName: string;
  clientName?: string;
  logoPath: string;
  url: string;
  tagline: string;
  colors: Record<string, string>;
  font: { display: string; body: string };
  style: { tone: string; backgroundType: string; motionStyle: string; layoutStyle: string };
  voice: { id: string; name: string; stability: number; similarityBoost: number; style: number; speed: number };
};

export const Brand: Branding = branding as Branding;
