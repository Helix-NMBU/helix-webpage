import { FlipWords } from "@/components/ui/shadcn-io/flip-words";

const helvetica: React.CSSProperties = {
  fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  fontWeight: 500,
  fontSize: "clamp(24px, 15vw, 150px)",
  lineHeight: 0.9,
};

export default function HeroText() {
  const words = ["engineers", "innovators", "creators", "builders", "people"];
  return (
    <div className="relative z-10 flex items-center h-full">
      <div className="w-full px-16 md:px-32">
        <p
          className="text-left text-white opacity-0 translate-y-8 animate-[fadeInUp_0.8s_ease-out_0.2s_forwards] whitespace-nowrap"
          style={helvetica}
        >
          Accelerating
        </p>
        <div
          className="overflow-visible text-left text-white opacity-0 translate-y-8 animate-[fadeInUp_0.8s_ease-out_0.4s_forwards] whitespace-nowrap"
          style={helvetica}
        >
          the{" "}
          <FlipWords
            words={words}
            duration={5000}
            letterDelay={0.02}
            wordDelay={0.1}
            style={{ color: "#aaebdf", fontStyle: "italic", fontWeight: 300 }}
          />
        </div>
        <p
          className="text-left text-white opacity-0 translate-y-8 animate-[fadeInUp_0.8s_ease-out_0.6s_forwards] whitespace-nowrap"
          style={helvetica}
        >
          of tomorrow.
        </p>
      </div>
    </div>
  );
}
