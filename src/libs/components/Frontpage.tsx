import { Link } from "react-router-dom";

export default function Frontpage() {
  return (
<div className="mt-28 mb-28 py-12 dark:bg-slate-900">

    <div className="max-w-screen-md mx-auto text-center">
        <h1 className="mb-4 text-3xl font-bold">What is<span className="text-accent"> Helix NMBU?</span></h1>
        <p className="text-white">
Helix NMBU is a Formula Student team at Norwegian University of Life Sciences (NMBU). The team aims to be a platform where students can develop technical skills and challenge themselves in innovation, entrepreneurship, marketing, finance and technological development to reach a common goal. </p>
    </div>

    <div className="flex flex-col justify-center space-y-5 md:flex-row md:space-y-0 md:space-x-6 lg:space-x-10 mt-7 mb-8">
        <div className="relative md:w-5/12">
            <img className="rounded-2xl" src="/lagbilde_2025.JPG" />
            <div className="absolute transform -translate-x-1/2 -translate-y-1/2 top-1/2 left-1/2">
                <Link to="/about" className="w-full inline-block text-center px-6 py-3 text-xs bg-white opacity-95 text-chart-3 ground transition duration-300 ease-in-out transform rounded-full lg:text-md focus:outline-none hover:scale-110 hover:bg-gray-100 font-medium">About Helix</Link>
            </div>
        </div>

        <div className="relative md:w-5/12 overflow-hidden rounded-2xl">
            <img className="w-full h-auto" src="/lagbilde_1.jpg" />
            {/* FS logo overlay - top centered, clipped by the rounded container */}
            <img
                src="/Updated_05_22/PNG/FS%20Logo%20Positive%20Print.png"
                alt="FS Logo"
                 className="pointer-events-none absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[70%] md:w-[75%] lg:w-[75%] z-15"
            />
            <div className="absolute transform -translate-x-1/2 -translate-y-1/2 top-1/2 left-1/2 z-30">
                <a href="https://www.imeche.org/events/formula-student" target="_blank" rel="noopener noreferrer" className="w-full inline-block text-center px-6 py-3 opacity-95 text-xs bg-white text-destructive transition duration-300 ease-in-out transform rounded-full lg:text-md focus:outline-none hover:scale-110 hover:bg-gray-100 font-medium">Go to Website</a>
            </div>
        </div>
    </div>
</div>

     );
}