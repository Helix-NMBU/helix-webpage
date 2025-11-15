
export default function CarouselItem({image, name}: {image: string; name: string}) {
  return (
    <div className="carousel-card">
      <img src={image} alt={name}></img>
    </div>
  );
}