import { NavLink, useNavigate } from "react-router-dom";
import { ArrowBackIcon, CloseIcon, HamburgerIcon } from "@chakra-ui/icons";
import { Flex, FlexProps, Heading, IconButton, Spacer } from "@chakra-ui/react";
import { PropsWithChildren } from "react";
import { openMenu } from "@app/signals";
import Logo from "./Logo";
import { t } from "@lingui/macro";

export default function PageHeader({
  back = false,
  close = false,
  showLogo = false,
  to,
  toolbar,
  children,
  ...rest
}: PropsWithChildren<{
  back?: boolean;
  close?: boolean;
  showLogo?: boolean;
  to?: string;
  toolbar?: React.ReactNode;
}> &
  FlexProps) {
  const navigate = useNavigate();
  const backButton = (
    <IconButton
      aria-label="Back"
      variant="ghost"
      icon={back ? <ArrowBackIcon /> : <CloseIcon />}
      {...(to
        ? {
            as: NavLink,
            to,
          }
        : {
            onClick: () => navigate(-1),
          })}
    />
  );

  return (
    <Flex
      pl={{ base: 2, lg: 4 }}
      pr={4}
      alignItems="center"
      justifyContent="space-between"
      height={{ base: "60px", lg: "72px" }}
      position="sticky"
      top="0"
      bgColor="bg.200"
      backdropFilter="blur(12px)"
      borderBottomWidth="1px"
      borderBottomColor="whiteAlpha.50"
      mb={4}
      zIndex={10}
      {...rest}
    >
      {back || close ? (
        backButton
      ) : (
        <IconButton
          icon={<HamburgerIcon />}
          display={{ base: "flex", lg: "none" }}
          aria-label={t`Open menu`}
          variant="ghost"
          onClick={() => {
            openMenu.value = true;
          }}
        />
      )}
      {showLogo ? (
        <Logo display={{ base: "flex", lg: "none" }} svgId="h" />
      ) : (
        <Heading
          size="md"
          ml={2}
          fontWeight="medium"
          display="flex"
          alignItems="center"
        >
          {children}
        </Heading>
      )}
      <Spacer />
      {toolbar}
    </Flex>
  );
}
