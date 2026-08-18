import Svg, { Path } from "react-native-svg";

function HalfSwipe(props: any) {
  return (
    <Svg
      xmlns="http://www.w3.org/2000/svg"
      width={29}
      height={25}
      viewBox="0 0 29 25"
      fill="none"
      {...props}
    >
      <Path
        d="M9.02.317V0H29v25.01H9.02v-.143c0-1.837-1.214-3.584-3.275-4.965C2.829 17.95 0 15.391 0 12.591s2.833-5.358 5.745-7.309C7.805 3.902 9.02 2.154 9.02.317z"
        fill="#00DFAB"
      />
      <Path
        d="M5.682 10.303l-2.193 2.034 2.193 1.793"
        stroke="#1D1D1D"
        strokeOpacity={0.11}
        strokeLinecap="round"
      />
      <Path
        d="M10.283 10.303L8.09 12.337l2.193 1.793"
        stroke="#1D1D1D"
        strokeOpacity={0.11}
        strokeWidth={0.9}
        strokeLinecap="round"
      />
      <Path
        d="M14.884 10.303l-2.193 2.034 2.193 1.793"
        stroke="#1D1D1D"
        strokeOpacity={0.11}
        strokeWidth={0.8}
        strokeLinecap="round"
      />
      <Path
        d="M19.485 10.303l-2.193 2.034 2.193 1.793"
        stroke="#1D1D1D"
        strokeOpacity={0.11}
        strokeWidth={0.7}
        strokeLinecap="round"
      />
      <Path
        d="M24.086 10.303l-2.193 2.034 2.193 1.793"
        stroke="#1D1D1D"
        strokeOpacity={0.11}
        strokeWidth={0.6}
        strokeLinecap="round"
      />
      <Path
        d="M28.687 10.303l-2.193 2.034 2.193 1.793"
        stroke="#1D1D1D"
        strokeOpacity={0.11}
        strokeWidth={0.5}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export default HalfSwipe;
