import { FlipWords } from './FlipWords'

const HeroStatement = () => {
  const words = ["Engineers", "Economists", "Designers", "Developers", "Leaders", "People"];

  return (
    <div className="w-full max-w-7xl mx-auto">
      <div className="min-h-screen flex items-center justify-start px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-left max-w-4xl">
          <div className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl text-primary-foreground font-bold leading-tight">
            The future needs skilled 
            <FlipWords words={words} /> <br />
            <div className="text-lg sm:text-xl md:text-2xl lg:text-3xl text-primary-foreground font-normal mt-2 sm:mt-4">
              - We form them
            </div>
          </div>
          <div className="text-sm sm:text-base md:text-lg lg:text-xl text-primary-foreground font-light mt-4 sm:mt-6 max-w-3xl leading-relaxed">
            Unique practical experience for students through the world's largest engineering competition - Formula Student
          </div>
        </div>
      </div>
    </div>
  );

};

export const HeroSection = () => {
  return (
    <div>
      <HeroStatement />
    </div>
  );
}