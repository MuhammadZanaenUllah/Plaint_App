import Svg, { Path } from "react-native-svg";

function RightWave(props: any) {
  return (
    <Svg
      xmlns="http://www.w3.org/2000/svg"
      width={9}
      height={25}
      viewBox="0 0 9 25"
      fill="none"
      {...props}
    >
      <Path
        d="M8.969 0v.316c0 1.826-1.208 3.563-3.257 4.936C2.817 7.192 0 9.735 0 12.518c0 2.784 2.813 5.328 5.712 7.27 2.049 1.373 3.257 3.11 3.257 4.936v.143h.037V0h-.037z"
        fill="#231F20"
      />
      <Path
        d="M5.65 10.244l-2.18 2.023 2.18 1.782"
        stroke="#fff"
        strokeLinecap="round"
      />
    </Svg>
  );
}

export default RightWave;
