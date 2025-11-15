const about = () => {
    return (
        <div className="relative text-foreground min-h-[60vh] mt-20">
            <img src="/Helixspiral.png" alt="decorative spiral" className="absolute inset-0 object-cover object-top w-full h-full pointer-events-none opacity-12" />
            <div className="relative z-10 px-8 py-12 md:px-12">
                <div className="mx-auto space-y-6 text-base leading-relaxed max-w-7xl md:text-lg">
                    <h1 className="text-3xl font-bold md:text-4xl lg:text-5xl opacity-0 translate-y-8 animate-[fadeInUp_0.8s_ease-out_0.1s_forwards]">About us</h1>
                    
                    <div className="opacity-0 translate-y-8 animate-[fadeInUp_0.8s_ease-out_0.2s_forwards]">
                        <h2 className="text-2xl font-semibold">Helix NMBU</h2>
                        <p>
                        Helix NMBU is a dedicated Formula Student team based at the Norwegian University of Life Sciences (NMBU). Our team brings together a diverse group of students from thirteen different academic programs, ranging in age from 18 to 32. This wide range of backgrounds fosters a unique environment for interdisciplinary collaboration and skill development across faculties.
We are currently gearing up for our third consecutive participation in the prestigious Formula Student competition at Silverstone in 2025. With a strong focus on innovation, teamwork, and continuous improvement, we are working hard to build a competitive race car that reflects our passion and dedication
                        </p>
                    </div>

                    <div className="opacity-0 translate-y-8 animate-[fadeInUp_0.8s_ease-out_0.3s_forwards]">
                        <h2 className="text-2xl font-semibold">The beginning</h2>
                        <p>
                       Helix NMBU began as a bold vision shared by five passionate students at the Norwegian University of Life Sciences (NMBU), united by a common fascination with Formula 1 and a desire to build something extraordinary. Founding members André Hellne Rasen, Mari Helene Aasbø Heiberg, Carolyn Charles, Lavanyan Rathy, and Sathuriyan Sivathas laid the foundation for what was originally known as NMBU Racing.
Their goal was clear: to create a platform where students could bridge the gap between theory and practice. By establishing a Formula Student team, they aimed to offer fellow students a hands-on environment to apply their academic knowledge, develop practical skills, and collaborate across disciplines in pursuit of a shared ambition.
                        </p>
                    </div>

                    <div className="opacity-0 translate-y-8 animate-[fadeInUp_0.8s_ease-out_0.4s_forwards]">
                        <h2 className="text-2xl font-semibold">The journey</h2>
                        <p>
                        The journey of Helix NMBU began in the autumn of 2022, when the founding members came together to shape their vision and define the goals of the team. After months of planning and collaboration throughout the autumn and spring semesters, NMBU Racing was officially established on May 2, 2023.
As the team evolved, so did its identity. In August 2023, following discussions around branding and design, the team adopted a new name—Helix NMBU—to better reflect its dynamic and forward-thinking spirit.
Later that autumn, the first official Helix NMBU team was assembled, ready to take on the ambitious challenge of designing and building their very first Formula Student race car.
                        </p>
                    </div>
                    
                    <div className="mt-12 opacity-0 translate-y-8 animate-[fadeInUp_0.8s_ease-out_0.5s_forwards]">
                        <h2 className="text-2xl font-semibold">Logo evolution</h2>
       
                        <div className="grid items-start grid-cols-2 gap-4 mt-6 md:grid-cols-4">
                            <figure className="flex flex-col items-center text-center opacity-0 translate-y-8 animate-[fadeInUp_0.8s_ease-out_0.6s_forwards]">
                                <img src="/Helix%2022.jpg" alt="Helix 22" className="object-contain w-full h-32 p-2 bg-white rounded-md shadow-sm" />
                                <figcaption className="mt-2 text-sm">2022 — 2023</figcaption>
                            </figure>

                            <figure className="flex flex-col items-center text-center opacity-0 translate-y-8 animate-[fadeInUp_0.8s_ease-out_0.7s_forwards]">
                                <img src="/Helix%2023.jpg" alt="Helix 23" className="object-contain w-full h-32 p-2 bg-white rounded-md shadow-sm" />
                                <figcaption className="mt-2 text-sm">2023 — 2024</figcaption>
                            </figure>

                            <figure className="flex flex-col items-center text-center opacity-0 translate-y-8 animate-[fadeInUp_0.8s_ease-out_0.8s_forwards]">
                                <img src="/Helix%2024.avif" alt="Helix 24" className="object-contain w-full h-32 p-2 bg-white rounded-md shadow-sm" />
                                <figcaption className="mt-2 text-sm">2024 — 2025</figcaption>
                            </figure>

                            <figure className="flex flex-col items-center text-center opacity-0 translate-y-8 animate-[fadeInUp_0.8s_ease-out_0.9s_forwards]">
                                <img src="/Helix%2025.png" alt="Helix logo (white)" className="object-contain w-full h-32 p-2 bg-white rounded-md shadow-sm" />
                                <figcaption className="mt-2 text-sm">2025 - current</figcaption>
                            </figure>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default about;