import CarCarousel from "@libs/components/CarCarousel";
import { useEffect, useState } from "react";

interface Car {
  id: number;
  name: string;
  season: string;
  image: string;
  stats: {
    focus: string;
    engine: string;
    weight: string;
  };
}

const Garage = () => {
  const [cars, setCars] = useState<Car[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/CarInfo.json")
      .then((res) => res.json())
      .then((data) => {
        setCars(data);
        setLoading(false);
      })
      .catch((error) => {
        console.error("Error loading cars:", error);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background text-foreground">
        <div className="text-xl">Loading cars...</div>
      </div>
    );
  }

  return <CarCarousel cars={cars} />;
};

export default Garage;