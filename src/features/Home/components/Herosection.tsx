import BlueprintGrid from "@/components/BlueprintGrid";
import HeroText from "./HeroText";

export default function HeroSection() {
  return (
    <div>
      <section className="relative w-full h-[100vh] overflow-hidden pt-0">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ backgroundColor: "rgba(0, 0, 122, 0.35)" }}
        />
        <BlueprintGrid />
        <HeroText />
      </section>
    </div>
  );
}