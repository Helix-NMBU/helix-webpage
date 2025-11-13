export default function Frontpage() {
  return (
<div className="py-12 mt-28 mb-28">

    <div className="max-w-screen-md mx-auto text-center">
        <h1 className="mb-4 text-3xl font-bold">What is<span className="text-accent"> Helix NMBU?</span></h1>
        <p className="text-white">
Helix NMBU is a Formula Student team at Norwegian University of Life Sciences (NMBU). The team aims to be a platform where students can develop technical skills and challenge themselves in innovation, entrepreneurship, marketing, finance and technological development to reach a common goal. </p>
    </div>

    <div className="flex flex-col justify-center mb-8 space-y-5 md:flex-row md:space-y-0 md:space-x-6 lg:space-x-10 mt-7">
        <div className="relative md:w-5/12">
            <img className="rounded-2xl" src="/lagbilde_2025.JPG" />
            <div className="absolute transform -translate-x-1/2 -translate-y-1/2 top-1/2 left-1/2">
                <h1 className="mb-3 font-bold text-center text-white uppercase lg:text-xl">About us</h1>
                <button className="w-full px-6 py-3 text-xs font-medium transition duration-300 ease-in-out transform bg-white rounded-full text-slate-900 lg:text-md focus:outline-none hover:scale-110 hover:bg-gray-100">Learn more</button>
            </div>
        </div>

        <div className="relative overflow-hidden md:w-5/12 rounded-2xl">
            <img className="w-full h-auto" src="/lagbilde.jpg" />
            {/* FS logo overlay - top centered, clipped by the rounded container */}
            <img
                src="/Updated_05_22/PNG/FS%20Logo%20Positive%20Print.png"
                alt="FS Logo"
                 className="pointer-events-none absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[65%] md:w-[65%] lg:w-[70%] z-15"
            />
            <div className="absolute z-30 transform -translate-x-1/2 -translate-y-1/2 top-1/2 left-1/2">
                <button className="w-full px-6 py-3 text-xs font-medium transition duration-300 ease-in-out transform bg-white rounded-full  text-muted lg:text-md focus:outline-none hover:scale-110 hover:bg-gray-100">Go to Website</button>
            </div>
        </div>
    </div>
</div>

     );
}