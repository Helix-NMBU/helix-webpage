import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import CarouselItem from "@libs/components/Carouselitem.tsx";
import { loadSponsors } from "../../../libs/lib/staticContent";

type Sponsor = {
  image?: string;
  name: string;
};

export default function AutoplayCarousel() {
  const [cards, setCards] = useState<Sponsor[]>([]);

  useEffect(() => {
    loadSponsors()
      .then((data) => setCards((data || []).filter((s) => s.image)))
      .catch((err) => {
        console.error("Failed to load sponsor.json", err);
      });
  }, []);

  // compute the scroll distance (half the total track width) so the
  // CSS animation can translate by an exact pixel value instead of 50%.
  const trackRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const setScrollDistance = () => {
      // measure after images have loaded to get accurate widths
      const imgs = Array.from(track.querySelectorAll<HTMLImageElement>("img"));
      const unloaded = imgs.filter((i) => !i.complete);

      const doMeasure = () => {
        const distance = Math.round(track.scrollWidth / 2);
        track.style.setProperty("--scroll-distance", `-${distance}px`);
      };

      if (unloaded.length > 0) {
        let remaining = unloaded.length;
        const onLoad = () => {
          remaining -= 1;
          if (remaining <= 0) doMeasure();
        };
        unloaded.forEach((img) => img.addEventListener("load", onLoad, { once: true }));
        // fallback: if images don't fire load, measure after a short delay
        setTimeout(doMeasure, 500);
      } else {
        doMeasure();
      }
    };

    // set initially and on resize so values stay accurate
    setScrollDistance();
    window.addEventListener("resize", setScrollDistance);
    return () => window.removeEventListener("resize", setScrollDistance);
  }, [cards]);

  if (!cards || cards.length === 0) {
    return null; // or a small placeholder
  }

  // Duplicate the items so the CSS animation can scroll seamlessly
  const renderList = [...cards, ...cards];

  return (
    <Link to="sponsorpage" aria-label="View all sponsors" className="block pb-10 md:pb-16">
      <div className="carousel-container">
        <div className="carousel-track" ref={trackRef}>
        {renderList.map((card, idx) => (
          <CarouselItem
            key={`${card.name}-${idx}`}
            image={card.image}
            name={card.name}
          />
        ))}
        </div>
      </div>
    </Link>
  );
}