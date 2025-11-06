const about = () => {
    return (
        <div className="relative text-foreground min-h-[60vh]">
            <img src="/Helixspiral.png" alt="decorative spiral" className="absolute inset-0 w-full h-full object-top object-cover opacity-12 pointer-events-none" />
            <div className="relative z-10 px-8 md:px-12 py-12">
                <div className="mx-auto max-w-7xl space-y-6 text-base md:text-lg leading-relaxed">
                    <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold">About us</h1>
<h2 className="text-2xl font-semibold">Helix NMBU</h2>
                    <p>
                        Helix NMBU is a dedicated Formula Student team based at the Norwegian University of Life Sciences (NMBU). Our team brings together a diverse group of students from thirteen different academic programs, ranging in age from 18 to 32. This wide range of backgrounds fosters a unique environment for interdisciplinary collaboration and skill development across faculties.
We are currently gearing up for our third consecutive participation in the prestigious Formula Student competition at Silverstone in 2025. With a strong focus on innovation, teamwork, and continuous improvement, we are working hard to build a competitive race car that reflects our passion and dedication
                    </p>

                    <h2 className="text-2xl font-semibold">The beginning</h2>
                    <p>
                       Helix NMBU began as a bold vision shared by five passionate students at the Norwegian University of Life Sciences (NMBU), united by a common fascination with Formula 1 and a desire to build something extraordinary. Founding members André Hellne Rasen, Mari Helene Aasbø Heiberg, Carolyn Charles, Lavanyan Rathy, and Sathuriyan Sivathas laid the foundation for what was originally known as NMBU Racing.
Their goal was clear: to create a platform where students could bridge the gap between theory and practice. By establishing a Formula Student team, they aimed to offer fellow students a hands-on environment to apply their academic knowledge, develop practical skills, and collaborate across disciplines in pursuit of a shared ambition.
                    </p>

                    <h2 className="text-2xl font-semibold">The journey</h2>
                    <p>
                        The journey of Helix NMBU began in the autumn of 2022, when the founding members came together to shape their vision and define the goals of the team. After months of planning and collaboration throughout the autumn and spring semesters, NMBU Racing was officially established on May 2, 2023.
As the team evolved, so did its identity. In August 2023, following discussions around branding and design, the team adopted a new name—Helix NMBU—to better reflect its dynamic and forward-thinking spirit.
Later that autumn, the first official Helix NMBU team was assembled, ready to take on the ambitious challenge of designing and building their very first Formula Student race car.
                    </p>
                    <div className="mt-12">
                        <h2 className="text-2xl font-semibold">Logo evolution</h2>
       
                    <div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-start mt-6">
                            <figure className="flex flex-col items-center text-center">
                                <img src="/Helix%2022.avif" alt="Helix 22" className="w-full h-32 object-contain bg-white p-2 rounded-md shadow-sm" />
                                <figcaption className="mt-2 text-sm">2022 — 2023</figcaption>
                            </figure>

                            <figure className="flex flex-col items-center text-center">
                                <img src="/Helix%2023.avif" alt="Helix 23" className="w-full h-32 object-contain bg-white p-2 rounded-md shadow-sm" />
                                <figcaption className="mt-2 text-sm">2023 — 2024</figcaption>
                            </figure>

                            <figure className="flex flex-col items-center text-center">
                                <img src="/Helix%2024.avif" alt="Helix 24" className="w-full h-32 object-contain bg-white p-2 rounded-md shadow-sm" />
                                <figcaption className="mt-2 text-sm">2024 — 2025</figcaption>
                            </figure>

                            <figure className="flex flex-col items-center text-center">
                                <img src="/Helix%2025.png" alt="Helix logo (white)" className="w-full h-32 object-contain bg-white p-2 rounded-md shadow-sm" />
                                <figcaption className="mt-2 text-sm">2025 - current</figcaption>
                            </figure>
                        </div>
                         </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default about;