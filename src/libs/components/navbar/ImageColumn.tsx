interface ImageColumnProps {
  translateY: number;
  hoveredLink: string | null;
  direction: 'left' | 'right';
  isMenuOpen: boolean;
}

interface ImageConfig {
  src: string;
  alt: string;
  hoverKey: string;
  grayscaleDefault?: string;
}

export const ImageColumn: React.FC<ImageColumnProps> = ({ translateY, hoveredLink, direction, isMenuOpen }) => {
  const leftImages: ImageConfig[] = [
    {
      src: "/nav_pictures/home.jpg",
      alt: "Home",
      hoverKey: "home",
      grayscaleDefault: "grayscale-0"
    },
    {
      src: "/nav_pictures/journey.jpg",
      alt: "Journey",
      hoverKey: "journey",
      grayscaleDefault: "grayscale-0"
    }
  ];

  const rightImages: ImageConfig[] = [
    {
      src: "/nav_pictures/garage.jpg",
      alt: "Garage",
      hoverKey: "garage",
      grayscaleDefault: "grayscale-30"
    },
    {
      src: "/nav_pictures/partners.jpg",
      alt: "Partners",
      hoverKey: "partners",
      grayscaleDefault: "grayscale-0"
    }
  ];

  const images = direction === 'left' ? leftImages : rightImages;
  
  // Same delay for all images
  const imageDelay = '0.4s';

  return (
    <div 
      className="flex-col hidden gap-8 transition-transform duration-300 ease-out md:flex"
      style={{ transform: `translateY(${translateY}px)` }}
    >
      {images.map((image) => {
        const motionClass = isMenuOpen
          ? "opacity-100 translate-y-0"
          : "opacity-0 -translate-y-4";
        
        return (
          <div 
            key={image.hoverKey} 
            className={`relative w-60 h-60 md:w-60 md:h-60 lg:w-90 lg:h-90 ${motionClass}`}
            style={{
              transition: "opacity 0.5s ease, transform 0.6s ease",
              transitionDelay: isMenuOpen ? imageDelay : "0s",
            }}
          >
            <img 
              src={image.src} 
              alt={image.alt} 
              className={`object-cover w-full h-full shadow-lg transition-all duration-300 ${
                hoveredLink === image.hoverKey ? image.grayscaleDefault : 'grayscale'
              }`}
            />
            <div 
              className={`absolute inset-0 bg-background transition-opacity duration-300 ${
                hoveredLink === image.hoverKey ? 'opacity-0' : 'opacity-40'
              }`}
            />
          </div>
        );
      })}
    </div>
  );
};
