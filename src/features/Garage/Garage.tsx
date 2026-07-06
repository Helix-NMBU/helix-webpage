import CarCarousel from "@libs/components/CarCarousel";
import { useEffect, useState } from "react";
import { loadCars, type CarRecord } from "../../libs/lib/staticContent";

const Garage = () => {
  const [cars, setCars] = useState<CarRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCars()
      .then((data) => {
        setCars(data);
      })
      .catch((error) => {
        console.error("Error loading cars:", error);
      })
      .finally(() => setLoading(false));
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