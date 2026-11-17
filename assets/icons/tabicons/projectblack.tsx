import * as React from "react"
import Svg, { Rect } from "react-native-svg"

function ProjectIconBlack(props: any) {
  return (
    <Svg
      xmlns="http://www.w3.org/2000/svg"
      width={18}
      height={18}
      viewBox="0 0 18 18"
      fill="none"
      {...props}
    >
      <Rect
        x={0.55}
        y={0.55}
        width={16.6674}
        height={16.6674}
        rx={4.45}
        stroke="#000"
        strokeWidth={1.1}
      />
      <Rect
        x={4}
        y={4}
        width={2.4}
        height={7.6}
        rx={0.8}
        stroke="#000"
        strokeWidth={1.1}
      />
      <Rect
        x={7.8}
        y={4}
        width={2.4}
        height={9.4}
        rx={0.8}
        stroke="#000"
        strokeWidth={1.1}
      />
      <Rect
        x={11.6}
        y={4}
        width={2.4}
        height={6.2}
        rx={0.8}
        stroke="#000"
        strokeWidth={1.1}
      />
    </Svg>
  )
}

export default ProjectIconBlack
