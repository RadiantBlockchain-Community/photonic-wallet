import { Link } from "react-router-dom";
import { Box, Flex, FlexProps, Text } from "@chakra-ui/react";

// Prefix is used so fill url(#...) ids are unique, otherwise nothing will render"
const LogoSvg = ({ svgId, ...rest }: { svgId: string }) => {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" {...rest}>
      <g clipPath={`url(#${svgId}clip0_38_38)`}>
        <path
          d="M20.0078 24.4131C22.4408 24.4131 24.4131 22.4408 24.4131 20.0078C24.4131 17.5749 22.4408 15.6025 20.0078 15.6025C17.5749 15.6025 15.6025 17.5749 15.6025 20.0078C15.6025 22.4408 17.5749 24.4131 20.0078 24.4131Z"
          fill={`url(#${svgId}paint0_radial_38_38)`}
        />
        <path
          d="M30.2602 22.4111C28.9306 22.4111 27.8573 21.3378 27.8573 20.0082C27.8573 15.683 24.3331 12.1588 20.0079 12.1588C18.6783 12.1588 17.605 11.0855 17.605 9.75591C17.605 8.42632 18.6783 7.35303 20.0079 7.35303C26.9922 7.35303 32.663 13.0399 32.663 20.0082C32.663 21.3378 31.5898 22.4111 30.2602 22.4111Z"
          fill={`url(#${svgId}paint1_radial_38_38)`}
        />
        <path
          d="M20.0082 32.663C13.0238 32.663 7.35303 26.9762 7.35303 20.0079C7.35303 18.6783 8.42632 17.605 9.75591 17.605C11.0855 17.605 12.1588 18.6783 12.1588 20.0079C12.1588 24.3331 15.683 27.8573 20.0082 27.8573C21.3378 27.8573 22.4111 28.9306 22.4111 30.2602C22.4111 31.5898 21.3378 32.663 20.0082 32.663Z"
          fill={`url(#${svgId}paint2_radial_38_38)`}
        />
        <path
          d="M2.40288 22.4109C1.07329 22.4109 0 21.3376 0 20.008C0 8.97077 8.97077 0 20.008 0C21.3376 0 22.4109 1.07329 22.4109 2.40288C22.4109 3.73248 21.3376 4.80577 20.008 4.80577C11.63 4.80577 4.80577 11.63 4.80577 20.008C4.80577 21.3376 3.73248 22.4109 2.40288 22.4109Z"
          fill={`url(#${svgId}paint3_radial_38_38)`}
        />
        <path
          d="M20.0079 39.9998C18.6783 39.9998 17.605 38.9265 17.605 37.5969C17.605 36.2673 18.6783 35.194 20.0079 35.194C28.3859 35.194 35.2101 28.3698 35.2101 19.9918C35.2101 18.6622 36.2834 17.5889 37.613 17.5889C38.9426 17.5889 40.0159 18.6622 40.0159 19.9918C39.9999 31.029 31.0291 39.9998 20.0079 39.9998Z"
          fill={`url(#${svgId}paint4_radial_38_38)`}
        />
      </g>
      <defs>
        <radialGradient
          id={`${svgId}paint0_radial_38_38`}
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(14.7679 15.3243) rotate(38.6343) scale(16.2655)"
        >
          <stop offset="0.122839" stopColor="#74E1E8" />
          <stop offset="0.305208" stopColor="#46B5A1" />
          <stop offset="1" stopColor="#090F97" />
        </radialGradient>
        <radialGradient
          id={`${svgId}paint1_radial_38_38`}
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(16.1784 6.87751) rotate(38.6343) scale(27.7993)"
        >
          <stop offset="0.122839" stopColor="#74E1E8" />
          <stop offset="0.305208" stopColor="#46B5A1" />
          <stop offset="1" stopColor="#090F97" />
        </radialGradient>
        <radialGradient
          id={`${svgId}paint2_radial_38_38`}
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(5.92647 17.1295) rotate(38.6343) scale(27.7993)"
        >
          <stop offset="0.122839" stopColor="#74E1E8" />
          <stop offset="0.305208" stopColor="#46B5A1" />
          <stop offset="1" stopColor="#090F97" />
        </radialGradient>
        <radialGradient
          id={`${svgId}paint3_radial_38_38`}
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(-2.12314 -0.707714) rotate(38.6343) scale(41.3736)"
        >
          <stop offset="0.122839" stopColor="#74E1E8" />
          <stop offset="0.305208" stopColor="#46B5A1" />
          <stop offset="1" stopColor="#090F97" />
        </radialGradient>
        <radialGradient
          id={`${svgId}paint4_radial_38_38`}
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(15.4818 16.8812) rotate(38.6343) scale(41.3736)"
        >
          <stop offset="0.122839" stopColor="#74E1E8" />
          <stop offset="0.305208" stopColor="#46B5A1" />
          <stop offset="1" stopColor="#090F97" />
        </radialGradient>
        <clipPath id={`${svgId}clip0_38_38`}>
          <rect width="40" height="40" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
};

export default function Logo({
  svgId,
  responsive = true,
  text = "",
  ...rest
}: { svgId: string; responsive?: boolean; text?: string } & FlexProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = ({ lg, ...props }: any) => (responsive ? { ...props, lg } : props);

  return (
    <Flex
      alignItems="center"
      justifyContent="center"
      as={Link}
      to="/objects"
      flexDir={r({ base: "row", lg: "column" })}
      {...rest}
    >
      <Box
        width="8"
        height="8"
        mr={r({ base: "-28px", lg: 0 })}
        mb={r({ base: 0, lg: "-28px" })}
        //bgGradient="linear(to-r, #FF00AA, #0000FF)"
        backgroundColor="blue.900"
        borderRadius="50%"
        filter="blur(12px)"
        animation="spin1 1s ease-in-out"
      />
      <Box
        as={LogoSvg}
        svgId={svgId}
        w={6}
        h={6}
        zIndex={1}
        color="lightBlue.A400"
        mr={r({ base: 1, lg: 0 })}
        sx={{
          "& path": {
            transformOrigin: "center center",
          },
          "& path:nth-of-type(-n+3)": {
            animation: { lg: "spin1 1s ease-in-out" },
          },
          "& path:nth-of-type(n+4)": {
            animation: { lg: "spin2 1s ease-in-out" },
          },
        }}
      />
      <Text
        as="div"
        fontFamily="Days One, sans-serif"
        fontSize="md"
        color="gray.100"
        animation={{ lg: "bgmove 1s ease-in-out" }}
        bgSize="200%"
        textShadow="dark-lg"
        userSelect="none"
        zIndex="10"
      >
        {text || "PHOTONIC"}
      </Text>
    </Flex>
  );
}
