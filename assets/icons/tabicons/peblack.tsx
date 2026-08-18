import * as React from "react"
import Svg, { Path, Rect } from "react-native-svg"

function PEIconBlack(props: any) {
  return (
    <Svg
      xmlns="http://www.w3.org/2000/svg"
      width={19}
      height={20}
      viewBox="0 0 19 20"
      fill="none"
      {...props}
    >
      <Path
        d="M1.449 9.59a.55.55 0 10.202 1.082l-.101-.54-.101-.541zM17.222.455a.55.55 0 00-.637-.445L11.711.87a.55.55 0 10.192 1.084l4.332-.767.767 4.332a.55.55 0 101.083-.191L17.222.454zM1.55 10.131l.1.541c3.312-.618 11.022-3.429 15.482-9.807L16.68.55l-.45-.315C11.996 6.29 4.602 9.002 1.448 9.591l.1.54z"
        fill="#000"
      />
      <Rect
        x={0.55}
        y={13.8596}
        width={4.39942}
        height={5.15889}
        rx={1.45}
        stroke="#000"
        strokeWidth={1.1}
      />
      <Rect
        x={7.30635}
        y={11.8166}
        width={4.39942}
        height={7.20151}
        rx={1.45}
        stroke="#000"
        strokeWidth={1.1}
      />
      <Rect
        x={14.0104}
        y={8.43867}
        width={4.39942}
        height={10.5798}
        rx={1.45}
        stroke="#000"
        strokeWidth={1.1}
      />
    </Svg>
  )
}

export default PEIconBlack
