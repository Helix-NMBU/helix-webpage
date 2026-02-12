
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

const CarInfoCard = ({ car }: { car: Car }) => {
  return (
    <div className="relative flex flex-col items-center justify-center w-full max-w-4xl mx-auto">
            {/* Big background text for Børsen */}
            <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[20vw] font-extrabold text-secondary opacity-40 select-none pointer-events-none z-0 whitespace-nowrap">{car.name.toUpperCase()}</span>
            <h1 className="relative z-10 font-bold text-center text-7xl">Season {car.season}</h1>
            <div className="flex justify-center w-full">
            <img src={car.image} alt={car.name} className="z-10 relative h-[63vh] object-contain mb-8" />
            </div>
            {/* Stats overlay for Børsen */}
            <div className="relative z-10 flex flex-row items-center justify-between w-full max-w-5xl gap-12 px-12 py-6 mx-auto -mt-32 text-2xl text-white shadow-lg bg-black/70 rounded-xl">
            <div className="flex-1 text-center">
                <h3 className="mb-2 text-2xl font-semibold">Focus</h3>
                <div className="text-xl">{car.stats.focus}</div>
            </div>
            <div className="flex-1 text-center">
                <h3 className="mb-2 text-2xl font-semibold">Motor</h3>
                <div className="text-xl">{car.stats.motor}</div>
            </div>
            <div className="flex-1 text-center">
                <h3 className="mb-2 text-2xl font-semibold">Weight</h3>
                <div className="text-xl">{car.stats.weight}</div>
            </div>
            </div>
        </div>
    );
};

export default CarInfoCard;