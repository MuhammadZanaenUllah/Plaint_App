import Svg, { Path } from "react-native-svg";

function LeftWave(props: any) {
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
        d="M.037 24.867v-.316c0-1.826 1.208-3.563 3.257-4.936 2.894-1.94 5.711-4.483 5.711-7.267 0-2.783-2.812-5.327-5.711-7.269C1.244 3.706.037 1.97.037.143V0H0v24.867h.037z"
        fill="#231F20"
      />
      <Path
        d="M3.356 14.623l2.18-2.023-2.18-1.782"
        stroke="#fff"
        strokeLinecap="round"
      />
    </Svg>
  );
}

export default LeftWave;
