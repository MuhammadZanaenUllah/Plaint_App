import * as React from "react"
import Svg, { Rect, Path } from "react-native-svg"

function LeaveIconBlack(props: any) {
  return (
    <Svg
      xmlns="http://www.w3.org/2000/svg"
      width={22}
      height={20}
      viewBox="0 0 22 20"
      fill="none"
      {...props}
    >
      <Rect
        x={0.55}
        y={2.91377}
        width={20.3521}
        height={15.931}
        rx={4.45}
        stroke="#000"
        strokeWidth={1.1}
      />
      <Path d="M.108 6.695h21.236" stroke="#000" strokeWidth={1.1} />
      <Path
        d="M4.37.55v3.565M8.607.55v3.565M12.845.55v3.565M17.082.55v3.565M5.865 8.823l-2.522 2.522M3.343 8.823l2.523 2.522M11.987 8.823l-2.522 2.522-.732-1.026M18.11 8.823l-2.523 2.522M15.587 8.823l2.522 2.522M5.865 14.026L3.344 16.55l-.716-.997M11.987 14.026L9.465 16.55M9.465 14.026l2.522 2.523M18.109 14.026l-2.522 2.523-.894-1.106"
        stroke="#000"
        strokeWidth={1.1}
        strokeLinecap="round"
      />
    </Svg>
  )
}

export default LeaveIconBlack
