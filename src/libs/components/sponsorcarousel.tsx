import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import CarouselItem from "./Carouselitem.tsx";

type Sponsor = {
  image: string;
  name: string;
};

export default function AutoplayCarousel() {
  const [cards, setCards] = useState<Sponsor[]>([]);

  useEffect(() => {
    // Load sponsors from the public folder at runtime
    fetch("/sponsor.json")
      .then((res) => res.json())
      .then((data: Sponsor[]) => setCards(data || []))
      .catch((err) => {
        console.error("Failed to load sponsor.json", err);
      });
  }, []);

  if (!cards || cards.length === 0) {
    return null; // or a small placeholder
  }

  // Duplicate the items so the CSS animation can scroll seamlessly
  const renderList = [...cards, ...cards];

  return (
    <Link to="sponsorpage" aria-label="View all sponsors" className="block">
      <div className="carousel-container">
        <div className="carousel-track">
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