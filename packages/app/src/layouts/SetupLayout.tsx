import Logo from "@app/components/Logo";
import { Flex } from "@chakra-ui/react";
import { Outlet } from "react-router-dom";

export default function SetupLayout() {
  return (
    <>
      <Flex
        position="fixed"
        alignSelf="stretch"
        pl={4}
        height={{ base: "60px", lg: "72px" }}
        top="0"
        left="0"
        right="0"
        bgColor="bg.100"
        mb={4}
        zIndex={10}
      >
        <Logo svgId="m" responsive={false} />
      </Flex>
      <Outlet />
    </>
  );
}
