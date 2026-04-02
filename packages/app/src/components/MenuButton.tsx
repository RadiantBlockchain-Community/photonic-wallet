import { PropsWithChildren } from "react";
import { Button, ButtonProps } from "@chakra-ui/react";
import { Link, useLocation } from "react-router-dom";
import gradient from "/gradient.svg";
import { openMenu } from "@app/signals";

export default function MenuButton({
  to,
  as,
  match,
  children,
  ...rest
}: PropsWithChildren<
  {
    to?: string;
    as?: React.ElementType;
    match?: string | string[];
  } & ButtonProps
>) {
  const { pathname } = useLocation();

  const matched = () => {
    if (!match) return false;
    return (Array.isArray(match) ? match : [match]).some((m) =>
      pathname.startsWith(m)
    );
  };

  const active = match ? matched() : pathname === to;
  return (
    <Button
      variant="ghost"
      borderRadius="lg"
      mx={2}
      justifyContent="left"
      alignItems="center"
      as={as || Link}
      to={to}
      py={6}
      px={4}
      width="calc(100% - 16px)"
      overflow="hidden"
      whiteSpace="nowrap"
      textOverflow="ellipsis"
      color={active ? "white" : "whiteAlpha.700"}
      fontSize="sm"
      bgImage={active ? `url(${gradient})` : undefined}
      bgPosition="center center"
      bgSize="cover"
      bgRepeat="no-repeat"
      transition="all 0.15s ease"
      sx={{
        _hover: {
          bg: active ? undefined : "whiteAlpha.100",
          color: active ? undefined : "whiteAlpha.900",
        },
        _active: {
          bg: active ? undefined : "whiteAlpha.100",
        },
        "& .chakra-button__icon": {
          marginEnd: "0.5rem",
          flexShrink: 0,
        },
        "& > span": {
          overflow: "hidden",
          textOverflow: "ellipsis",
        },
      }}
      onClick={() => {
        openMenu.value = false;
      }}
      {...rest}
    >
      {children}
    </Button>
  );
}
