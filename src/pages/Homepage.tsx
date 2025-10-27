
import AutoplayCarousel from "../libs/components/sponsorcarousel";

const Homepage = () => {
  return (
    <div className="bg-background text-foreground">
      <h1 className="text-5xl font-bold"> Velkommen til Helix!</h1>

      {/* Sponsor carousel */}
      <section className="mt-8">
        <AutoplayCarousel />
      </section>
    </div>
  );
};

export default Homepage;
