import svgPaths from "../../svg-wy2xd84yv";

function BracketLine() {
    return (
        <div className="h-[64.5px] relative w-[4px]">
            <div className="absolute inset-[-0.43%_-10.4%_-0.43%_-12.5%]">
                <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 4.91603 65.0547">
                    <path d={svgPaths.p1844bf00} stroke="var(--stroke-0, #595959)" />
                </svg>
            </div>
        </div>
    );
}

function BracketLineFlipped() {
    return (
        <div className="-scale-y-100 flex-none rotate-180">
            <BracketLine />
        </div>
    );
}

function MatrixFrame() {
    return (
        <div className="h-[65.5px] relative shrink-0 w-[273px]">
            <div className="absolute h-[64.5px] left-[21px] top-px w-[4px]"><BracketLine /></div>
            <div className="absolute h-[64.5px] left-[240px] top-px w-[4px]"><BracketLine /></div>
            <div className="absolute h-[64.5px] left-[108px] top-px w-[4px]"><BracketLine /></div>
            <div className="absolute flex h-[64.5px] items-center justify-center left-[52px] top-px w-[4px]"><BracketLineFlipped /></div>
            <div className="absolute flex h-[64.5px] items-center justify-center left-[269px] top-px w-[4px]"><BracketLineFlipped /></div>
            <div className="absolute flex h-[64.5px] items-center justify-center left-[222px] top-px w-[4px]"><BracketLineFlipped /></div>

            <div className="-translate-y-1/2 absolute flex flex-col font-['Georama',sans-serif] font-light justify-center leading-[0] left-[calc(50%-136.5px)] text-[24px] text-[rgba(228,228,228,0.85)] top-[33px] whitespace-nowrap" style={{ fontVariationSettings: "'wdth' 100" }}>
                <p className="leading-none">T</p>
            </div>
            <div className="-translate-y-1/2 absolute flex flex-col font-['Georama',sans-serif] font-light justify-center leading-[0] left-[calc(50%-103.5px)] text-[24px] text-[rgba(228,228,228,0.85)] top-[12px] whitespace-nowrap" style={{ fontVariationSettings: "'wdth' 100" }}>
                <p className="leading-none">x</p>
            </div>
            <div className="-translate-y-1/2 absolute flex flex-col font-['Georama',sans-serif] font-light justify-center leading-[0] left-[calc(50%+113.5px)] text-[24px] text-[rgba(228,228,228,0.85)] top-[12px] whitespace-nowrap" style={{ fontVariationSettings: "'wdth' 100" }}>
                <p className="leading-none">x</p>
            </div>
            <div className="-translate-y-1/2 absolute flex flex-col font-['Georama',sans-serif] font-light justify-center leading-[0] left-[calc(50%-19.5px)] text-[24px] text-[rgba(228,228,228,0.85)] top-[14px] whitespace-nowrap" style={{ fontVariationSettings: "'wdth' 100" }}>
                <p className="leading-none">1.00 0.00</p>
            </div>
            <div className="-translate-y-1/2 absolute flex flex-col font-['Georama',sans-serif] font-light justify-center leading-[0] left-[calc(50%-60.5px)] text-[24px] text-[rgba(228,228,228,0.85)] top-[33px] whitespace-nowrap" style={{ fontVariationSettings: "'wdth' 100" }}>
                <p className="leading-none">=</p>
            </div>
            <div className="-translate-y-1/2 absolute flex flex-col font-['Georama',sans-serif] font-light justify-center leading-[0] left-[calc(50%+114.5px)] text-[24px] text-[rgba(228,228,228,0.85)] top-[50px] whitespace-nowrap" style={{ fontVariationSettings: "'wdth' 100" }}>
                <p className="leading-none">y</p>
            </div>
            <div className="-translate-y-1/2 absolute flex flex-col font-['Georama',sans-serif] font-light justify-center leading-[0] left-[calc(50%-18.5px)] text-[24px] text-[rgba(228,228,228,0.85)] top-[52px] whitespace-nowrap" style={{ fontVariationSettings: "'wdth' 100" }}>
                <p className="leading-none">0.00 1.00</p>
            </div>
            <div className="-translate-y-1/2 absolute flex flex-col font-['Georama',sans-serif] font-light justify-center leading-[0] left-[calc(50%-102.5px)] text-[24px] text-[rgba(228,228,228,0.85)] top-[52px] whitespace-nowrap" style={{ fontVariationSettings: "'wdth' 100" }}>
                <p className="leading-none">y</p>
            </div>
        </div>
    );
}

function Quote() {
    return (
        <div className="bg-[#0a0a0a] relative rounded-[16px] shrink-0 w-full">
            <div aria-hidden="true" className="absolute border border-[#808080] border-solid inset-0 pointer-events-none rounded-[16px]" />
            <div className="content-stretch flex items-start px-[35px] py-[37px] relative w-full">
                <MatrixFrame />
            </div>
        </div>
    );
}

export default function FigmaContainer() {
    return (
        <div className="bg-black relative size-full">
            {/* Horizontal center line */}
            <div className="absolute inset-[48.51%_-2.12%_51.49%_0]">
                <div className="absolute inset-[-0.5px_0]">
                    <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 3087 1">
                        <path d="M0 0.5H3087" stroke="var(--stroke-0, white)" strokeMiterlimit="10" />
                    </svg>
                </div>
            </div>

            {/* Menu icon */}
            <div className="absolute left-[3104px] overflow-clip size-[34px] top-[-41px]">
                <div className="absolute bottom-1/4 left-[12.5%] right-[12.5%] top-1/4">
                    <div className="absolute inset-[-8.82%_-5.88%]">
                        <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 28.5 20">
                            <path d={svgPaths.p1664b380} stroke="var(--stroke-0, #A2A2A2)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
                        </svg>
                    </div>
                </div>
            </div>

            {/* Title */}
            <div className="-translate-y-1/2 absolute flex flex-col font-['Georama',sans-serif] font-extralight justify-center leading-[0] left-[calc(50%-1468.5px)] text-[48px] text-white top-[91px] whitespace-nowrap" style={{ fontVariationSettings: "'wdth' 100" }}>
                <p className="leading-none">VISUAL:MATH</p>
            </div>

            {/* Info panel */}
            <div className="absolute bg-[#1c1c1c] content-stretch flex flex-col gap-[32px] items-center left-[43px] px-[32px] py-[38px] rounded-[36px] top-[458px]">
                <div aria-hidden="true" className="absolute border border-[rgba(150,150,150,0.64)] border-solid inset-0 pointer-events-none rounded-[36px]" />
                <Quote />
                <div className="content-stretch flex flex-col gap-[15px] items-start relative shrink-0 w-full font-['Georama',sans-serif] font-light text-[15px] text-[rgba(255,255,255,0.85)]" style={{ fontVariationSettings: "'wdth' 100" }}>
                    <div className="flex items-center justify-between w-full whitespace-nowrap">
                        <p className="leading-none whitespace-pre">Scale Factor  </p>
                        <p className="leading-none">1.00</p>
                    </div>
                    <div className="flex items-center justify-between w-full whitespace-nowrap">
                        <p className="leading-none">Rotation Angle</p>
                        <p className="leading-none">0</p>
                    </div>
                    <div className="flex items-center justify-between w-full whitespace-nowrap">
                        <p className="leading-none">Translation</p>
                        <p className="leading-none">(0.0, 0.0)</p>
                    </div>
                    <div className="h-[53px] relative shrink-0 w-[343px]">
                        <div className="absolute flex gap-[6px] items-center left-0 top-0 w-[343px]">
                            <div className="relative shrink-0 size-[6px]">
                                <svg className="block size-full" fill="none" viewBox="0 0 6 6">
                                    <circle cx="3" cy="3" fill="#848484" r="3" />
                                </svg>
                            </div>
                            <p className="leading-[1.27]">Origin: (0,0)</p>
                        </div>
                        <div className="absolute flex gap-[6px] items-center left-0 top-[24px] w-[343px]">
                            <div className="relative shrink-0 size-[6px]">
                                <svg className="block size-full" fill="none" viewBox="0 0 6 6">
                                    <circle cx="3" cy="3" fill="white" r="3" />
                                </svg>
                            </div>
                            <p className="leading-[1.27]">Current: (0.0, 0.0)</p>
                        </div>
                    </div>
                </div>
                <div className="bg-[#4d4d4d] flex h-[40px] items-center justify-center px-[12px] rounded-[25px] shrink-0 w-[343px] relative">
                    <div aria-hidden="true" className="absolute border-[#707070] border-[0.5px] border-solid inset-0 pointer-events-none rounded-[25px]" />
                    <p className="font-['Georama',sans-serif] font-light leading-none text-[14px] text-center text-white tracking-[1.12px] whitespace-nowrap" style={{ fontVariationSettings: "'wdth' 100" }}>
                        RESET TO DEFAULTS
                    </p>
                </div>
            </div>

            {/* Vertical divider */}
            <div className="absolute flex inset-[-8.86%_75.19%_-1.16%_24.81%] items-center justify-center">
                <div className="flex-none h-px rotate-90 w-[1515px]">
                    <div className="relative size-full">
                        <div className="absolute inset-[-0.5px_0]">
                            <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 1515 1">
                                <path d="M0 0.5H1515" stroke="var(--stroke-0, white)" strokeMiterlimit="10" />
                            </svg>
                        </div>
                    </div>
                </div>
            </div>

            {/* Sine wave graphic */}
            <div className="absolute h-[1158px] left-[750px] top-[89px] w-[2083px]">
                <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 2083.87 1159">
                    <path d={svgPaths.p14f80a80} stroke="var(--stroke-0, white)" />
                </svg>
            </div>

            {/* Instructions */}
            <div className="-translate-y-1/2 absolute flex flex-col font-['Georama',sans-serif] font-light justify-center leading-[0] left-[calc(50%-1466.5px)] text-[15px] text-[rgba(255,255,255,0.85)] top-[1309.5px] whitespace-nowrap" style={{ fontVariationSettings: "'wdth' 100" }}>
                <ul className="list-disc whitespace-pre-wrap">
                    <li className="mb-0 ms-[22.5px]"><span className="leading-none">1 Hand Pinch: Translate</span></li>
                    <li className="mb-0 ms-[22.5px]"><span className="leading-none">2 Hand Pinch: Rotate &amp; Scale</span></li>
                    <li className="ms-[22.5px]"><span className="leading-none">Mouse: Drag (Shift/Alt for Rot/Scale)</span></li>
                </ul>
            </div>
        </div>
    );
}
