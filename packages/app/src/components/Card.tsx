import { Box, BoxProps, forwardRef } from "@chakra-ui/react";
import { PropsWithChildren } from "react";

export default forwardRef<BoxProps, "div">(function Card(
  { children, ...rest }: PropsWithChildren,
  ref
) {
  return (
    <Box
      display="flex"
      flexDirection="column"
      backgroundColor="bg.100"
      borderWidth="1px"
      borderColor="whiteAlpha.100"
      boxShadow="0 4px 24px rgba(0, 0, 0, 0.2)"
      borderRadius="xl"
      p={8}
      ref={ref}
      {...rest}
    >
      {children}
    </Box>
  );
});
