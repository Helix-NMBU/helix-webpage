import CarInfoCard from "@libs/components/CarInfoCard";
import React, { useEffect, useState } from "react";

interface Car {
    id: number;
  name: string;
  season: string;
  image: string;
  stats: {
    focus: string;
    motor: string;
    weight: string;
  };
}

const garage = () => {
const [cars, setCars] = useState<Car[]>([]);

  useEffect(() => {
    fetch("/CarInfo.json")
      .then((res) => res.json())
      .then((data) => setCars(data));
  }, []);

  if (cars.length === 0) return <div>Loading...</div>;

  return (
    <div className="bg-background text-foreground flex flex-col gap-32 items-center py-12">
        {cars.map((car, index) => (
                <CarInfoCard key={index} car={car} />
            ))}
     </div>
  );
};

export default garage;