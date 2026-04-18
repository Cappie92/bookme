import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { FavoriteButton } from '@src/components/FavoriteButton';
import { addToFavorites, removeFromFavorites } from '@src/services/api/favorites';
import { MockAuthProvider } from '../../../test-utils/mocks/auth-context.mock';

jest.mock('@src/services/api/favorites');

describe('FavoriteButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render favorite button', () => {
    const { getByTestId } = render(
      <MockAuthProvider>
        <FavoriteButton type="master" itemId={1} itemName="Test Master" />
      </MockAuthProvider>
    );

    expect(getByTestId('favorite-button')).toBeTruthy();
  });

  it('should show empty heart when initialFavorite is false', () => {
    const { getByTestId } = render(
      <MockAuthProvider>
        <FavoriteButton type="master" itemId={1} itemName="Test Master" initialFavorite={false} />
      </MockAuthProvider>
    );

    const button = getByTestId('favorite-button');
    expect(button).toBeTruthy();
  });

  it('should add to favorites when clicked', async () => {
    (addToFavorites as jest.Mock).mockResolvedValue(undefined);

    const onFavoriteChange = jest.fn();
    const { getByTestId } = render(
      <MockAuthProvider>
        <FavoriteButton
          type="master"
          itemId={1}
          itemName="Test Master"
          onFavoriteChange={onFavoriteChange}
        />
      </MockAuthProvider>
    );

    await waitFor(() => {
      const button = getByTestId('favorite-button');
      fireEvent.press(button);
    });

    await waitFor(() => {
      expect(addToFavorites).toHaveBeenCalledWith('master', 1, 'Test Master');
      expect(onFavoriteChange).toHaveBeenCalledWith('master', 1, true);
    });
  });

  it('should remove from favorites when clicked again', async () => {
    (removeFromFavorites as jest.Mock).mockResolvedValue(undefined);

    const onFavoriteChange = jest.fn();
    const { getByTestId } = render(
      <MockAuthProvider>
        <FavoriteButton
          type="master"
          itemId={1}
          itemName="Test Master"
          initialFavorite={true}
          onFavoriteChange={onFavoriteChange}
        />
      </MockAuthProvider>
    );

    const button = getByTestId('favorite-button');
    fireEvent.press(button);

    await waitFor(() => {
      expect(removeFromFavorites).toHaveBeenCalledWith('master', 1);
      expect(onFavoriteChange).toHaveBeenCalledWith('master', 1, false);
    });
  });

  it('should use initialFavorite prop', () => {
    const { getByTestId } = render(
      <MockAuthProvider>
        <FavoriteButton
          type="master"
          itemId={1}
          itemName="Test Master"
          initialFavorite={true}
        />
      </MockAuthProvider>
    );

    expect(getByTestId('favorite-button')).toBeTruthy();
  });

  it('should handle different sizes', () => {
    const { getByTestId: getByTestIdSm } = render(
      <MockAuthProvider>
        <FavoriteButton type="master" itemId={1} itemName="Test" size="sm" />
      </MockAuthProvider>
    );

    const { getByTestId: getByTestIdLg } = render(
      <MockAuthProvider>
        <FavoriteButton type="master" itemId={1} itemName="Test" size="lg" />
      </MockAuthProvider>
    );

    expect(getByTestIdSm('favorite-button')).toBeTruthy();
    expect(getByTestIdLg('favorite-button')).toBeTruthy();
  });
});

