export const EclipseOverlay = () => {
    return (
        <svg
            className="absolute inset-0 w-full h-full"
            xmlns="http://www.w3.org/2000/svg"
            preserveAspectRatio="xMidYMid slice"
            viewBox="0 0 200 200"
        >
            <defs>
                <pattern
                    id="eclipsePattern"
                    x="0"
                    y="0"
                    width="100"
                    height="100"
                    patternUnits="userSpaceOnUse"
                    patternTransform="rotate(35)"
                >
                    <path
                        d="M 0,50 Q 12.5,30 25,50 T 50,50 T 75,50 T 100,50"
                        stroke="#05015aff"
                        strokeWidth="0.5"
                        fill="none"
                    />
                    <path
                        d="M 0,90 Q 25,70 50,90 T 100,90"
                        stroke="#05015aff"
                        strokeWidth="0.5"
                        fill="none"
                    />
                </pattern>
            </defs>
            <rect
                x="0"
                y="0"
                width="100%"
                height="100%"
                fill="url(#eclipsePattern)"
            />
        </svg>
    );
};
