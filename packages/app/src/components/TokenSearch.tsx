import { useRef, useState } from "react";
import db from "@app/db";
import {
  Box,
  Button,
  Flex,
  Icon,
  Input,
  Spinner,
  Text,
} from "@chakra-ui/react";
import { SmartToken, SmartTokenType } from "@app/types";
import { electrumWorker } from "@app/electrum/Electrum";
import TokenContent from "./TokenContent";
import { TbStack2, TbTriangleSquareCircle } from "react-icons/tb";

export default function TokenSearch({
  onSelect,
}: {
  onSelect: (glyph: SmartToken) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SmartToken[]>([]);
  const [focusIndex, setFocusIndex] = useState(0);
  const onChange: React.ChangeEventHandler<HTMLInputElement> = async (
    event
  ) => {
    const value = event.target.value.trim();
    setFocusIndex(0);
    setLoading(false);
    if (!value) {
      setResults([]);
      return;
    }

    // Check if value is a ref
    if (/([0-9a-f]{72})/.test(value)) {
      // Look up in database
      const result = await db.glyph.where({ ref: value }).first();
      setResults(result ? [result] : []);
      if (!result) {
        // Not found in database, fetch from ElectrumX
        setLoading(true);
        const fetched = await electrumWorker.value.fetchGlyph(value);
        if (fetched) {
          setResults([fetched]);
        }
        setLoading(false);
      }
    } else {
      // Not a ref, so do a text search in the database
      // TODO sort by string length so closer matches are at the top, or exact ticker match
      const results = await db.glyph
        .filter(
          (glyph) =>
            glyph.name.toLowerCase().includes(value.toLowerCase()) ||
            (glyph.ticker?.toLowerCase() || "").includes(value.toLowerCase())
        )
        .limit(5)
        .toArray();
      setResults(results);
    }
  };

  const reset = () => {
    setFocusIndex(0);
    setResults([]);
    setLoading(false);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const onInputBlur: React.FocusEventHandler<HTMLInputElement> = (e) => {
    if (!listRef.current?.contains(e.relatedTarget)) {
      reset();
    }
  };

  const onButtonBlur: React.FocusEventHandler<HTMLButtonElement> = () => {
    reset();
  };

  const onSelectItem = (index: number) => {
    onSelect(results[index]);
    reset();
  };

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (event) => {
    if (event.key === "ArrowDown") {
      setFocusIndex(focusIndex === results.length - 1 ? 0 : focusIndex + 1);
      event.preventDefault();
    } else if (event.key === "ArrowUp") {
      setFocusIndex(focusIndex === 0 ? results.length - 1 : focusIndex - 1);
      event.preventDefault();
    } else if (event.key === "Enter") {
      onSelectItem(focusIndex);
    }
  };

  return (
    <Box position="relative">
      <Input
        ref={inputRef}
        placeholder="Search by name, ticker or contract ID"
        onFocus={onChange}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onBlur={onInputBlur}
      />
      {(!!results.length || loading) && (
        <Box position="absolute" inset={0} top="100%" w="full" zIndex={10}>
          <Flex bgColor="bg.300" p={2} flexDir="column" gap={2} ref={listRef}>
            {loading ? (
              <Flex justifyContent="center" gap={4} p={4}>
                <Spinner /> Fetching glyph
              </Flex>
            ) : (
              results.map((glyph, index) => (
                <Button
                  variant="ghost"
                  justifyContent="left"
                  p={2}
                  key={glyph.id}
                  bgColor={index === focusIndex ? "bg.100" : "transparent"}
                  onBlur={onButtonBlur}
                  onClick={() => onSelectItem(index)}
                  onMouseOver={() => setFocusIndex(index)}
                  w="full"
                  leftIcon={
                    <Box w={6} h={6}>
                      <TokenContent glyph={glyph} thumbnail />
                    </Box>
                  }
                  rightIcon={
                    <Icon
                      color="gray.500"
                      as={
                        glyph.tokenType === SmartTokenType.NFT
                          ? TbTriangleSquareCircle
                          : TbStack2
                      }
                      boxSize={6}
                    />
                  }
                >
                  {glyph.ticker && (
                    <Text color="lightBlue.A400" mr={1}>
                      {glyph.ticker}
                    </Text>
                  )}
                  <Box flexGrow={1} textAlign="left">
                    {glyph.name}
                  </Box>
                </Button>
              ))
            )}
          </Flex>
        </Box>
      )}
    </Box>
  );
}
