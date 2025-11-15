import { Link } from "react-router-dom";
import { useRef, useEffect, useState } from "react";

export default function Frontpage() {
    const [isVisible, setIsVisible] = useState(false);
    const sectionRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                }
            },
            {
                threshold: 0.1, // Trigger when 10% of the component is visible
            }
        );

        if (sectionRef.current) {
            observer.observe(sectionRef.current);
        }

        return () => {
            if (sectionRef.current) {
                observer.unobserve(sectionRef.current);
            }
        };
    }, []);

    return (
<div ref={sectionRef} className="py-12 mt-0 bg-white mb-28">

    <div className={`max-w-screen-md mx-auto text-center transition-all duration-700 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
         style={{ transitionDelay: isVisible ? '0.1s' : '0s' }}>
        <h1 className="mb-4 text-3xl font-bold text-slate-700">What is<span className="text-accent"> Helix NMBU?</span></h1>
        <p className="text-slate-700">
Helix NMBU is a Formula Student team at Norwegian University of Life Sciences (NMBU). The team aims to be a platform where students can develop technical skills and challenge themselves in innovation, entrepreneurship, marketing, finance and technological development to reach a common goal. </p>
    </div>

    <div className="flex flex-col justify-center mb-8 space-y-5 md:flex-row md:space-y-0 md:space-x-6 lg:space-x-10 mt-7">
        <div className={`relative md:w-5/12 transition-all duration-700 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
             style={{ transitionDelay: isVisible ? '0.2s' : '0s' }}>
            <img className="rounded-2xl" src="/lagbilde_2025.JPG" />
            <div className="absolute transform -translate-x-1/2 -translate-y-1/2 top-1/2 left-1/2">
                <Link to="/about" className="inline-block w-full px-6 py-3 text-xs font-medium text-center transition duration-300 ease-in-out transform bg-white rounded-full opacity-95 text-chart-3 ground lg:text-md focus:outline-none hover:scale-110 hover:bg-gray-100">Our story</Link>
            </div>
        </div>

        <div className={`relative md:w-5/12 overflow-hidden rounded-2xl transition-all duration-700 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
             style={{ transitionDelay: isVisible ? '0.3s' : '0s' }}>
            <img className="w-full h-auto" src="/lagbilde_1.jpg" />
            {/* FS logo overlay - top centered, clipped by the rounded container */}
            <img
                src="/Updated_05_22/PNG/FS%20Logo%20Positive%20Print.png"
                alt="FS Logo"
                 className="pointer-events-none absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[70%] md:w-[75%] lg:w-[75%] z-15"
            />
            <div className="absolute z-30 transform -translate-x-1/2 -translate-y-1/2 top-1/2 left-1/2">
                <a href="https://www.imeche.org/events/formula-student" target="_blank" rel="noopener noreferrer" className="inline-block w-full px-6 py-3 text-xs font-medium text-center transition duration-300 ease-in-out transform bg-white rounded-full opacity-95 text-destructive lg:text-md focus:outline-none hover:scale-110 hover:bg-gray-100">Go to Website</a>
            </div>
        </div>
    </div>
</div>

     );
}